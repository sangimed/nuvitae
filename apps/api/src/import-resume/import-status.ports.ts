export type PublicProgressStep =
  | "checking_document"
  | "reading_content"
  | "organizing_resume_sections"
  | "preparing_review";

export interface ImportStatusQueueProgress {
  readonly step: PublicProgressStep;
  readonly progressKnown: boolean;
  readonly progressPercent?: number;
  readonly updatedAt: Date;
}

export interface ImportStatusQueueReader {
  readProgress(
    importId: string,
  ): Promise<ImportStatusQueueProgress | null | unknown>;
}

export interface ImportStatusRequestIdGenerator {
  nextRequestId(): string;
}
