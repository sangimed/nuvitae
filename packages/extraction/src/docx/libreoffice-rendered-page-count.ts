import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  DocxRenderedPageCounter,
  DocxExtractionLimits,
  ExtractionRequest,
  ExtractionResult,
  ExtractionSourceReader,
  PageCountResult,
} from "../adapters.js";
import {
  ExtractionOperationError,
  categoryFromUnknown,
  failed,
  throwIfAborted,
} from "../extraction-failures.js";
import {
  IsolatedParserRunner,
  type IsolatedParserCommand,
} from "../isolated-parser-runner.js";
import { PdfJsPdfAdapter } from "../pdf/pdfjs-pdf-adapter.js";
import { OoxmlDocxAdapter } from "./ooxml-docx-adapter.js";

export interface LibreOfficeRenderedPageCountOptions {
  readonly temporaryRoot: string;
  readonly libreOfficeExecutable: string;
  readonly maximumDocxSizeBytes: number;
  readonly maximumConvertedPdfSizeBytes: number;
  readonly maximumRenderedPageCount: number;
  readonly docxValidationLimits: DocxExtractionLimits;
}

/**
 * Converts only a generated, privacy-safe DOCX filename and returns only the
 * rendered page count. All input, output, profile and staging files live below
 * a unique working directory that is removed in `finally`.
 */
export class LibreOfficeRenderedPageCounter implements DocxRenderedPageCounter {
  constructor(
    private readonly sourceReader: ExtractionSourceReader,
    private readonly runner: IsolatedParserRunner,
    private readonly options: LibreOfficeRenderedPageCountOptions,
  ) {
    validateOptions(options);
  }

  async countRenderedPages(
    request: ExtractionRequest,
  ): Promise<ExtractionResult<PageCountResult>> {
    if (request.format !== "docx") {
      return failed("unsupported");
    }
    let workingDirectory: string | undefined;
    try {
      throwIfAborted(request.abortSignal);
      const temporaryRoot = await validateTemporaryRoot(
        this.options.temporaryRoot,
      );
      const source = await this.sourceReader.readSource({
        sourceStorageKey: request.sourceStorageKey,
        maximumBytes: this.options.maximumDocxSizeBytes,
        ...(request.abortSignal === undefined
          ? {}
          : { abortSignal: request.abortSignal }),
      });
      if (
        source.byteLength === 0 ||
        source.byteLength > this.options.maximumDocxSizeBytes
      ) {
        throw new ExtractionOperationError(
          source.byteLength === 0 ? "malformed" : "resource_limit",
        );
      }
      if (
        source.byteLength < 4 ||
        source[0] !== 0x50 ||
        source[1] !== 0x4b ||
        source[2] !== 0x03 ||
        source[3] !== 0x04
      ) {
        throw new ExtractionOperationError("malformed");
      }
      const validation = await new OoxmlDocxAdapter(
        {
          readSource: async () => new Uint8Array(source),
        },
        this.options.docxValidationLimits,
      ).extractText({
        importId: request.importId,
        ownerUserId: request.ownerUserId,
        sourceStorageKey: "controlled-render-input",
        format: "docx",
        ...(request.abortSignal === undefined
          ? {}
          : { abortSignal: request.abortSignal }),
      });
      if (!validation.ok) {
        return validation;
      }
      throwIfAborted(request.abortSignal);

      workingDirectory = await mkdtemp(
        join(temporaryRoot, "nuvitae-docx-render-"),
      );
      const inputPath = join(workingDirectory, "input.docx");
      const profilePath = join(workingDirectory, "libreoffice-profile");
      const outputPath = join(workingDirectory, "rendered.pdf");
      await mkdir(profilePath, { mode: 0o700 });
      const inputHandle = await open(
        inputPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          noFollowFlag(),
        0o600,
      );
      try {
        await inputHandle.writeFile(source);
        await inputHandle.sync();
      } finally {
        await inputHandle.close();
      }

      const command: IsolatedParserCommand = {
        executable: this.options.libreOfficeExecutable,
        arguments: [
          "--headless",
          "--nologo",
          "--nodefault",
          "--nolockcheck",
          "--nofirststartwizard",
          "--norestore",
          `-env:UserInstallation=${pathToFileURL(profilePath).href}`,
          "--convert-to",
          "pdf:writer_pdf_Export",
          "--outdir",
          "{STAGING_DIR}",
          inputPath,
        ],
        workingDirectory,
        environment: {
          HOME: workingDirectory,
          LANG: "C.UTF-8",
          LC_ALL: "C.UTF-8",
          SAL_DISABLE_OPENCL: "1",
          SAL_USE_VCLPLUGIN: "svp",
          TMPDIR: workingDirectory,
        },
        allowedEnvironmentKeys: [
          "HOME",
          "LANG",
          "LC_ALL",
          "SAL_DISABLE_OPENCL",
          "SAL_USE_VCLPLUGIN",
          "TMPDIR",
        ],
        outputCommit: {
          stagedRelativePath: "input.pdf",
          finalPath: outputPath,
          validate: async (candidate) => {
            const stats = await lstat(candidate);
            if (
              !stats.isFile() ||
              stats.isSymbolicLink() ||
              stats.size <= 0 ||
              stats.size > this.options.maximumConvertedPdfSizeBytes
            ) {
              return false;
            }
            const handle = await open(
              candidate,
              constants.O_RDONLY | noFollowFlag(),
            );
            try {
              const magic = Buffer.alloc(5);
              const { bytesRead } = await handle.read(magic, 0, 5, 0);
              return bytesRead === 5 && magic.toString("ascii") === "%PDF-";
            } finally {
              await handle.close();
            }
          },
        },
        ...(request.abortSignal === undefined
          ? {}
          : { abortSignal: request.abortSignal }),
      };
      const conversion = await this.runner.run(command);
      if (!conversion.ok) {
        return conversion;
      }
      throwIfAborted(request.abortSignal);

      const pdfBytes = await readFile(outputPath);
      if (pdfBytes.byteLength > this.options.maximumConvertedPdfSizeBytes) {
        return failed("resource_limit");
      }
      const generatedReader: ExtractionSourceReader = {
        readSource: async ({ abortSignal }) => {
          throwIfAborted(abortSignal);
          return new Uint8Array(pdfBytes);
        },
      };
      const counter = new PdfJsPdfAdapter(generatedReader, {
        maximumFileSizeBytes: this.options.maximumConvertedPdfSizeBytes,
        maximumPageCount: this.options.maximumRenderedPageCount,
      });
      return await counter.countPages({
        importId: request.importId,
        ownerUserId: request.ownerUserId,
        sourceStorageKey: "generated-rendered-pdf",
        format: "pdf",
        ...(request.abortSignal === undefined
          ? {}
          : { abortSignal: request.abortSignal }),
      });
    } catch (error) {
      return failed(
        request.abortSignal?.aborted === true
          ? "cancelled"
          : categoryFromUnknown(error, "unexpected"),
      );
    } finally {
      if (workingDirectory !== undefined) {
        await rm(workingDirectory, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  }
}

async function validateTemporaryRoot(candidate: string): Promise<string> {
  const path = resolve(candidate);
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new ExtractionOperationError("unexpected");
  }
  return await realpath(path);
}

function validateOptions(options: LibreOfficeRenderedPageCountOptions): void {
  if (
    !options.libreOfficeExecutable.startsWith("/") ||
    options.libreOfficeExecutable.includes("\0") ||
    !options.temporaryRoot.startsWith("/") ||
    options.temporaryRoot.includes("\0") ||
    [
      options.maximumDocxSizeBytes,
      options.maximumConvertedPdfSizeBytes,
      options.maximumRenderedPageCount,
    ].some((value) => !Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new TypeError("LibreOffice page-count options are invalid.");
  }
}

function noFollowFlag(): number {
  return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}
