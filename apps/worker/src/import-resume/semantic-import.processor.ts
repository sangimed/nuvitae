import { randomUUID } from "node:crypto";
import type {
  NuvitaeSemanticExtractionResponse,
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
import { buildSemanticParseRequest } from "./build-semantic-parse-request.js";

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
        buildSemanticParseRequest(
          document,
          extracted.fragments,
          input.correlationId,
        ),
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
        fields: mapFields(validation.response, document),
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

function mapFields(
  response: NuvitaeSemanticExtractionResponse,
  document: ImportedDocument,
): DeterministicResumeFieldCandidate[] {
  const fields: DeterministicResumeFieldCandidate[] = [];
  const push = (
    section: DeterministicResumeFieldCandidate["section"],
    fieldPath: string,
    semanticValue: SemanticValue | null,
    value: DeterministicResumeFieldCandidate["value"],
    order: number,
  ) => {
    if (!semanticValue) return;
    fields.push({
      section,
      fieldPath,
      value,
      sourceLocation: minimalLocation(document),
      confidence: semanticValue.confidence,
      inferenceStatus:
        semanticValue.classification === "inferred"
          ? "inferred_needs_review"
          : "not_inferred",
      sourceOrder: order,
    });
  };

  const contact = response.sections.contact;
  push(
    "contact",
    "contact.full_name",
    contact.fullName,
    textValue(contact.fullName),
    fields.length,
  );
  push(
    "contact",
    "contact.email",
    contact.email,
    textValue(contact.email),
    fields.length,
  );
  push(
    "contact",
    "contact.phone",
    contact.phone,
    textValue(contact.phone),
    fields.length,
  );
  push(
    "contact",
    "contact.location",
    contact.location,
    textValue(contact.location),
    fields.length,
  );
  push(
    "contact",
    "contact.website",
    contact.website,
    textValue(contact.website),
    fields.length,
  );
  push(
    "headline",
    "headline",
    response.sections.headline,
    textValue(response.sections.headline),
    fields.length,
  );
  push(
    "summary",
    "summary",
    response.sections.summary,
    textValue(response.sections.summary),
    fields.length,
  );

  response.sections.workExperience.forEach((work, workIndex) => {
    work.roles.forEach((role, roleIndex) => {
      const prefix = `work_experience.${workIndex}.roles.${roleIndex}`;
      push(
        "work_experience",
        `${prefix}.employer`,
        work.employerName,
        textValue(work.employerName),
        fields.length,
      );
      push(
        "work_experience",
        `${prefix}.employer_location`,
        work.employerLocation,
        textValue(work.employerLocation),
        fields.length,
      );
      push(
        "work_experience",
        `${prefix}.title`,
        role.title,
        textValue(role.title),
        fields.length,
      );
      push(
        "work_experience",
        `${prefix}.location`,
        role.location,
        textValue(role.location),
        fields.length,
      );
      const dateRange = buildRoleDateRange(role);
      if (dateRange !== undefined) {
        push(
          "work_experience",
          `${prefix}.date_range`,
          role.startDate ?? role.endDate,
          dateRange,
          fields.length,
        );
      }
      role.responsibilities.forEach((value) =>
        push(
          "work_experience",
          `${prefix}.responsibility`,
          value,
          textValue(value),
          fields.length,
        ),
      );
      role.achievements.forEach((value) =>
        push(
          "work_experience",
          `${prefix}.achievement`,
          value,
          textValue(value),
          fields.length,
        ),
      );
    });
  });

  response.sections.education.forEach((item, index) => {
    const prefix = `education.${index}`;
    push(
      "education",
      `${prefix}.institution`,
      item.institution,
      textValue(item.institution),
      fields.length,
    );
    push(
      "education",
      `${prefix}.credential`,
      item.degree,
      textValue(item.degree),
      fields.length,
    );
    push(
      "education",
      `${prefix}.field_of_study`,
      item.fieldOfStudy,
      textValue(item.fieldOfStudy),
      fields.length,
    );
  });

  response.sections.skills.forEach((item, index) =>
    push(
      "skills",
      `skills.${index}.name`,
      item.name,
      textValue(item.name),
      fields.length,
    ),
  );

  response.sections.languages.forEach((item, index) => {
    if (item.name === null) return;
    fields.push({
      section: "languages",
      fieldPath: `languages.${index}.name`,
      value: {
        kind: "language",
        name: item.name.value,
        ...(item.proficiency === null
          ? {}
          : { proficiency: item.proficiency.value }),
      },
      sourceLocation: minimalLocation(document),
      confidence: item.name.confidence,
      inferenceStatus:
        item.name.classification === "inferred"
          ? "inferred_needs_review"
          : "not_inferred",
      sourceOrder: fields.length,
    });
  });

  response.sections.projects.forEach((item, index) => {
    const prefix = `projects.${index}`;
    push(
      "projects",
      `${prefix}.name`,
      item.name,
      textValue(item.name),
      fields.length,
    );
    push(
      "projects",
      `${prefix}.description`,
      item.description,
      textValue(item.description),
      fields.length,
    );
  });

  response.sections.certifications.forEach((item, index) => {
    const prefix = `certifications.${index}`;
    push(
      "certifications",
      `${prefix}.name`,
      item.name,
      textValue(item.name),
      fields.length,
    );
    push(
      "certifications",
      `${prefix}.issuer`,
      item.issuer,
      textValue(item.issuer),
      fields.length,
    );
  });

  response.sections.professionalLinks.forEach((value) => {
    if (value === null) return;
    fields.push({
      section: "professional_links",
      fieldPath: "professional_links.url",
      value: { kind: "link", url: value.value },
      sourceLocation: minimalLocation(document),
      confidence: value.confidence,
      inferenceStatus:
        value.classification === "inferred"
          ? "inferred_needs_review"
          : "not_inferred",
      sourceOrder: fields.length,
    });
  });
  return fields;
}

function textValue(
  value: SemanticValue | null,
): DeterministicResumeFieldCandidate["value"] {
  if (value === null) return { kind: "text", value: "" };
  return { kind: "text", value: value.value };
}

function buildRoleDateRange(role: {
  readonly startDate: SemanticValue | null;
  readonly endDate: SemanticValue | null;
  readonly isOngoing: boolean | null;
}): DeterministicResumeFieldCandidate["value"] | undefined {
  const start = role.startDate?.value;
  const end = role.endDate?.value;
  const startDate = parseResumeYear(start);
  const endDate = parseResumeYear(end);
  const isOngoing =
    role.isOngoing === true || (end !== undefined && /present/i.test(end));
  if (startDate === undefined && endDate === undefined && !isOngoing)
    return undefined;
  return {
    kind: "date_range",
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
    isOngoing,
  };
}

function parseResumeYear(
  value: string | undefined,
): { readonly year: number; readonly precision: "year" } | undefined {
  if (value === undefined) return undefined;
  const match = /\b(19|20)\d{2}\b/.exec(value);
  if (match === null) return undefined;
  return { year: Number(match[0]), precision: "year" };
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
