import { importInitializationResponseSchema } from "@nuvitae/contracts";
import type { ImportInitializationResponse } from "@nuvitae/contracts";
import { apiPath } from "../api-config";

export type StartImportClientOutcome =
  | {
      readonly ok: true;
      readonly response: ImportInitializationResponse;
    }
  | {
      readonly ok: false;
      readonly category:
        | "authentication_required"
        | "invalid_upload"
        | "oversized_file"
        | "unsupported_format"
        | "rate_limited"
        | "temporarily_unavailable"
        | "unexpected_failure";
      readonly retryAfterSeconds?: number;
      readonly message: string;
    };

export async function startImportUpload(input: {
  readonly file: File;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<StartImportClientOutcome> {
  const body = new FormData();
  body.append("file", input.file);
  const fetcher = input.fetchImpl ?? fetch;

  try {
    const response = await fetcher(apiPath("/import-resume"), {
      method: "POST",
      body,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (!response.ok) {
      return mapStartError(
        response.status,
        response.headers.get("Retry-After"),
      );
    }

    const parsed = importInitializationResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      return {
        ok: false,
        category: "unexpected_failure",
        message: "The upload response could not be understood safely.",
      };
    }
    return { ok: true, response: parsed.data };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        category: "temporarily_unavailable",
        message: "The upload was stopped before it finished.",
      };
    }
    return {
      ok: false,
      category: "temporarily_unavailable",
      message: "Upload is temporarily unavailable. Try again later.",
    };
  }
}

function mapStartError(
  status: number,
  retryAfterHeader: string | null,
): StartImportClientOutcome {
  const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader);
  switch (status) {
    case 401:
      return {
        ok: false,
        category: "authentication_required",
        message: "Sign in before uploading your resume.",
      };
    case 400:
      return {
        ok: false,
        category: "invalid_upload",
        message: "Upload exactly one PDF or DOCX resume file.",
      };
    case 413:
      return {
        ok: false,
        category: "oversized_file",
        message: "Choose a resume file that is 10 MB or smaller.",
      };
    case 415:
      return {
        ok: false,
        category: "unsupported_format",
        message: "Choose a PDF or DOCX resume file.",
      };
    case 429:
      return {
        ok: false,
        category: "rate_limited",
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        message:
          "Too many import attempts are active. Wait before uploading again.",
      };
    case 503:
      return {
        ok: false,
        category: "temporarily_unavailable",
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        message: "Resume import is temporarily unavailable. Try again later.",
      };
    default:
      return {
        ok: false,
        category: "unexpected_failure",
        message: "The resume import could not be started.",
      };
  }
}

export function parseRetryAfterSeconds(
  value: string | null,
): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isInteger(seconds) && seconds > 0) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  const delta = Math.ceil((date - Date.now()) / 1000);
  return delta > 0 ? delta : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
