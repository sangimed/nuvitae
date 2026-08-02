import { createHash, randomUUID } from "node:crypto";
import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
  SemanticValue,
} from "@nuvitae/contracts";
import {
  resumeSemanticParserContractVersion,
  resumeSemanticParseRequestSchema,
} from "@nuvitae/contracts";
import {
  buildExtractionDraft,
  type DeterministicResumeFieldCandidate,
  type DeterministicWarningCandidate,
  type ImportedDocument,
} from "@nuvitae/domain";
import {
  fragmentsFromDocx,
  fragmentsFromPdf,
  type DocxDeterministicTextExtractor,
  type ExtractionSourceReader,
  type PdfPageText,
  type PdfSelectableTextExtractor,
  type ResumeSourceFragment,
} from "@nuvitae/extraction";
import {
  validateSemanticResponse,
  type ResumeSemanticParserProvider,
} from "@nuvitae/import-application";
import type {
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";

export interface SemanticImportProcessorPorts {
  readonly repository: ImportResumeRepository;
  readonly transactionRunner: PersistenceTransactionRunner;
  readonly sourceReader: ExtractionSourceReader;
  readonly pdfTextExtractor: PdfSelectableTextExtractor;
  readonly docxTextExtractor: DocxDeterministicTextExtractor;
  readonly provider: ResumeSemanticParserProvider | undefined;
  readonly clock?: { now(): Date };
  readonly logger?: SemanticImportLogger;
}

export interface SemanticImportLogger {
  info(event: string, metadata?: Readonly<Record<string, unknown>>): void;
  warn(event: string, metadata?: Readonly<Record<string, unknown>>): void;
}

export class SemanticImportProcessor {
  private readonly clock: { now(): Date };
  private readonly logger: SemanticImportLogger;

  constructor(private readonly ports: SemanticImportProcessorPorts) {
    this.clock = ports.clock ?? { now: () => new Date() };
    this.logger = ports.logger ?? {
      info: () => undefined,
      warn: () => undefined,
    };
  }

  async process(input: {
    ownerUserId: string;
    importedDocumentId: string;
    correlationId?: string;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const started = this.clock.now();
    const aggregate = await this.ports.repository.findImportByOwner(
      input.importedDocumentId,
      input.ownerUserId,
    );
    if (!aggregate || aggregate.document.ownerUserId !== input.ownerUserId)
      return;
    const document = aggregate.document;
    if (document.processingStatus === "ready_for_review") return;
    if (!isProcessable(document, this.clock.now())) return;

    await this.transition(document, "semantic_parsing_pending");
    await this.transition(document, "semantic_parsing_running");
    if (!this.ports.provider) {
      await this.transition(document, "provider_unavailable");
      this.log("provider_unavailable", document, started, 0, 0, true);
      return;
    }

    try {
      const extracted = await this.readAndNormalize(
        document,
        input.abortSignal,
      );
      if (!extracted.ok) {
        await this.transition(
          document,
          extracted.cancelled ? "cancelled" : "failed",
        );
        this.log(
          extracted.cancelled ? "cancelled" : "extraction_failed",
          document,
          started,
          0,
          0,
          extracted.cancelled,
        );
        return;
      }
      const requestResult = resumeSemanticParseRequestSchema.safeParse(
        buildRequest(document, extracted.fragments, input.correlationId),
      );
      if (!requestResult.success) {
        await this.transition(document, "semantic_response_invalid");
        this.log("request_invalid", document, started, 0, 0, false);
        return;
      }
      const providerResult = await this.ports.provider.parse(
        requestResult.data,
        {
          timeoutMs: this.ports.provider.capabilities.maxTimeoutMs,
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        },
      );
      if (!providerResult.ok) {
        await this.transition(
          document,
          providerResult.error.code === "timeout" ||
            providerResult.error.code === "cancelled"
            ? "failed"
            : providerResult.error.code === "not_configured" ||
                providerResult.error.code === "provider_unavailable"
              ? "provider_unavailable"
              : "semantic_response_invalid",
        );
        this.log(
          providerResult.error.code,
          document,
          started,
          0,
          0,
          providerResult.error.retryable,
        );
        return;
      }
      const validation = validateSemanticResponse({
        request: requestResult.data,
        response: providerResult.response,
      });
      this.log(
        "validated",
        document,
        started,
        validation.response ? countValues(validation.response) : 0,
        validation.diagnostics.length,
        false,
      );
      if (!validation.accepted || !validation.response) {
        await this.transition(document, "semantic_validation_failed");
        return;
      }
      const draftResult = buildExtractionDraft({
        importedDocument: document,
        fields: mapFields(validation.response, document, extracted.fragments),
        warnings: mapWarnings(validation.response),
        missingOrUnprocessedSections: [],
        ids: {
          draftId: randomUUID,
          fieldId: randomUUID,
          warningId: randomUUID,
        },
        now: this.clock.now(),
      });
      if (!draftResult.draft) {
        await this.transition(document, "semantic_validation_failed");
        return;
      }
      await this.ports.transactionRunner.transaction(async (manager) => {
        const current = await this.ports.repository.findImportByOwner(
          document.id,
          document.ownerUserId,
          manager,
        );
        if (
          !current ||
          current.document.processingStatus === "ready_for_review"
        )
          return;
        if (
          await this.ports.repository.findDraftByImportAndOwner(
            document.id,
            document.ownerUserId,
            manager,
          )
        )
          return;
        await this.ports.repository.saveDraft(draftResult.draft!, manager);
        await this.ports.repository.saveImportLifecycle(
          { ...current.document, processingStatus: "ready_for_review" },
          manager,
        );
      });
    } catch (error) {
      const cancelled = input.abortSignal?.aborted === true;
      await this.transition(document, cancelled ? "cancelled" : "failed");
      this.logger.warn("semantic_import_failed", {
        importId: document.id,
        outcome: cancelled ? "cancelled" : "unexpected_failure",
        retryable: !cancelled,
      });
      void error;
    }
  }

  private async readAndNormalize(
    document: ImportedDocument,
    abortSignal?: AbortSignal,
  ) {
    if (!document.storageKey || !document.fileExtension || abortSignal?.aborted)
      return { ok: false as const, cancelled: abortSignal?.aborted === true };
    let fragments: readonly ResumeSourceFragment[];
    if (document.fileExtension === "pdf") {
      const result = await this.ports.pdfTextExtractor.extractSelectableText({
        importId: document.id,
        ownerUserId: document.ownerUserId,
        sourceStorageKey: document.storageKey,
        format: "pdf",
        ...(abortSignal ? { abortSignal } : {}),
      });
      if (!result.ok)
        return {
          ok: false as const,
          cancelled: result.error.category === "cancelled",
        };
      fragments = fragmentsFromPdf(result.value as readonly PdfPageText[]);
    } else {
      const result = await this.ports.docxTextExtractor.extractText({
        importId: document.id,
        ownerUserId: document.ownerUserId,
        sourceStorageKey: document.storageKey,
        format: "docx",
        ...(abortSignal ? { abortSignal } : {}),
      });
      if (!result.ok)
        return {
          ok: false as const,
          cancelled: result.error.category === "cancelled",
        };
      fragments = fragmentsFromDocx(result.value);
    }
    return { ok: true as const, fragments };
  }

  private async transition(
    document: ImportedDocument,
    processingStatus: ImportedDocument["processingStatus"],
  ): Promise<void> {
    await this.ports.transactionRunner.transaction(async (manager) => {
      const current = await this.ports.repository.findImportByOwner(
        document.id,
        document.ownerUserId,
        manager,
      );
      if (current && current.document.processingStatus !== "ready_for_review")
        await this.ports.repository.saveImportLifecycle(
          { ...current.document, processingStatus },
          manager,
        );
    });
  }

  private log(
    outcome: string,
    document: ImportedDocument,
    started: Date,
    values: number,
    diagnostics: number,
    retryable: boolean,
  ): void {
    this.logger.info("semantic_import_outcome", {
      importId: document.id,
      contractVersion: resumeSemanticParserContractVersion,
      outcome,
      retryable,
      valueCountBucket: bucket(values),
      diagnosticCountBucket: bucket(diagnostics),
      durationBucket: bucket(
        Math.max(0, this.clock.now().getTime() - started.getTime()),
      ),
    });
  }
}

function buildRequest(
  document: ImportedDocument,
  fragments: readonly ResumeSourceFragment[],
  correlationId?: string,
): ResumeSemanticParseRequest {
  const normalized = fragments
    .map((fragment) =>
      fragment.text.normalize("NFKC").replace(/\s+/gu, " ").trim(),
    )
    .filter(Boolean);
  const text = normalized.join("\n");
  const sourceFragments = fragments
    .map((fragment, index) => ({
      order: index,
      line: index + 1,
      text: fragment.text.normalize("NFKC").replace(/\s+/gu, " ").trim(),
      hash: hash(fragment.text),
      bounds: {
        lineStart: index + 1,
        lineEnd: index + 1,
        start: 0,
        end: fragment.text.length,
      },
    }))
    .filter((fragment) => fragment.text.length > 0);
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: document.id,
    correlationId: correlationId ?? document.id,
    documentFormat: document.fileExtension === "docx" ? "docx" : "pdf",
    languageContext: {
      detectedLanguage:
        document.detectedLanguage && document.detectedLanguage !== "unsupported"
          ? document.detectedLanguage
          : "unknown",
      confidence: null,
      textDirection: "ltr",
    },
    normalizedTranscript: {
      text,
      sha256: hash(text),
      lineCount: Math.max(1, text.split("\n").length),
    },
    sourceFragments,
    fragmentHashes: sourceFragments.map((fragment) => fragment.hash),
    formatMetadata: {
      sourceFormat: document.fileExtension === "docx" ? "docx" : "pdf",
      extractionMode: "selectable_text",
      renderedPageCount: document.renderedPageCount ?? null,
      parserVersion: null,
    },
  } as ResumeSemanticParseRequest;
}

function mapFields(
  response: NuvitaeSemanticExtractionResponse,
  document: ImportedDocument,
  fragments: readonly ResumeSourceFragment[],
): DeterministicResumeFieldCandidate[] {
  const fields: DeterministicResumeFieldCandidate[] = [];
  const add = (
    section: DeterministicResumeFieldCandidate["section"],
    fieldPath: string,
    value: SemanticValue | null,
    order: number,
  ) => {
    if (!value) return;
    fields.push({
      section,
      fieldPath,
      value: { kind: "text", value: value.value },
      sourceLocation: minimalLocation(document),
      confidence: value.confidence,
      inferenceStatus:
        value.classification === "inferred"
          ? "inferred_needs_review"
          : "not_inferred",
      sourceOrder: order,
    });
  };
  for (const [key, value] of Object.entries(response.sections.contact))
    add("contact", `contact.${key}`, value, fields.length);
  add("headline", "headline", response.sections.headline, fields.length);
  add("summary", "summary", response.sections.summary, fields.length);
  response.sections.workExperience.forEach((work, index) => {
    add(
      "work_experience",
      `workExperience[${index}].employerName`,
      work.employerName,
      fields.length,
    );
    work.roles.forEach((role, roleIndex) => {
      for (const [key, value] of Object.entries(role))
        if (["title", "location", "startDate", "endDate"].includes(key))
          add(
            "work_experience",
            `workExperience[${index}].roles[${roleIndex}].${key}`,
            value as SemanticValue | null,
            fields.length,
          );
      for (const [key, values] of [
        ["responsibilities", role.responsibilities],
        ["achievements", role.achievements],
      ] as const)
        values.forEach((value, valueIndex) =>
          add(
            "work_experience",
            `workExperience[${index}].roles[${roleIndex}].${key}[${valueIndex}]`,
            value,
            fields.length,
          ),
        );
    });
  });
  response.sections.education.forEach((item, index) =>
    Object.entries(item).forEach(
      ([key, value]) =>
        key !== "candidateId" &&
        (Array.isArray(value)
          ? value.forEach((v, i) =>
              add(
                "education",
                `education[${index}].${key}[${i}]`,
                v,
                fields.length,
              ),
            )
          : add(
              "education",
              `education[${index}].${key}`,
              value as SemanticValue | null,
              fields.length,
            )),
    ),
  );
  response.sections.skills.forEach((item, index) => {
    add("skills", `skills[${index}].name`, item.name, fields.length);
    add("skills", `skills[${index}].category`, item.category, fields.length);
  });
  response.sections.languages.forEach((item, index) => {
    add("languages", `languages[${index}].name`, item.name, fields.length);
    add(
      "languages",
      `languages[${index}].proficiency`,
      item.proficiency,
      fields.length,
    );
  });
  response.sections.projects.forEach((item, index) =>
    Object.entries(item).forEach(
      ([key, value]) =>
        key !== "candidateId" &&
        (Array.isArray(value)
          ? value.forEach((v, i) =>
              add(
                "projects",
                `projects[${index}].${key}[${i}]`,
                v,
                fields.length,
              ),
            )
          : add(
              "projects",
              `projects[${index}].${key}`,
              value as SemanticValue | null,
              fields.length,
            )),
    ),
  );
  response.sections.certifications.forEach((item, index) =>
    Object.entries(item).forEach(
      ([key, value]) =>
        key !== "candidateId" &&
        (Array.isArray(value)
          ? value.forEach((v, i) =>
              add(
                "certifications",
                `certifications[${index}].${key}[${i}]`,
                v,
                fields.length,
              ),
            )
          : add(
              "certifications",
              `certifications[${index}].${key}`,
              value as SemanticValue | null,
              fields.length,
            )),
    ),
  );
  response.sections.professionalLinks.forEach((value, index) =>
    add(
      "professional_links",
      `professionalLinks[${index}]`,
      value,
      fields.length,
    ),
  );
  void fragments;
  return fields;
}

function mapWarnings(
  response: NuvitaeSemanticExtractionResponse,
): DeterministicWarningCandidate[] {
  return [
    ...response.ambiguityDiagnostics.map((item) => ({
      warningType: "ambiguous" as const,
      section: "summary" as const,
      message: item.safeDetail ?? "Some imported information needs review.",
      requiresResolution: true,
    })),
    ...response.conflictDiagnostics.map((item) => ({
      warningType: "conflicting" as const,
      section: "summary" as const,
      message:
        item.safeDetail ?? "Conflicting imported information needs review.",
      requiresResolution: true,
    })),
    ...response.privacyWarnings.map((item) => ({
      warningType: "unsupported" as const,
      section: "summary" as const,
      message: item.safeDetail ?? "Some imported content needs review.",
      requiresResolution: false,
    })),
  ];
}

function minimalLocation(document: ImportedDocument) {
  return {
    kind: "minimal" as const,
    label: "imported_from_initial_resume" as const,
    confirmedByUser: false,
    sourceDeletedAt: undefined,
    documentId: document.id,
  };
}
function hash(value: string): string {
  return createHash("sha256")
    .update(value.normalize("NFKC").replace(/\s+/gu, " ").trim())
    .digest("hex");
}
function bucket(value: number): string {
  return value < 5
    ? "0-4"
    : value < 20
      ? "5-19"
      : value < 100
        ? "20-99"
        : "100+";
}
function countValues(response: NuvitaeSemanticExtractionResponse): number {
  return JSON.stringify(response.sections).match(/"value"/gu)?.length ?? 0;
}
function isProcessable(document: ImportedDocument, now: Date): boolean {
  return (
    document.uploadStatus === "uploaded" &&
    document.validationStatus === "accepted" &&
    document.deletionStatus === "not_scheduled" &&
    document.deletedAt === undefined &&
    document.retentionExpiresAt.getTime() > now.getTime() &&
    document.storageKey !== undefined
  );
}
