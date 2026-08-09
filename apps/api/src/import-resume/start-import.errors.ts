export type StartImportPublicErrorCode =
  | "authentication_required"
  | "rate_limited"
  | "active_job_limit_reached"
  | "queued_job_limit_reached"
  | "processing_start_denied"
  | "unsupported_format"
  | "empty_file"
  | "unsafe_upload_metadata"
  | "oversized_file"
  | "import_limit_unavailable"
  | "storage_unavailable"
  | "persistence_unavailable"
  | "internal_failure";

export class StartImportHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: StartImportPublicErrorCode,
    readonly userMessage: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(userMessage);
    this.name = "StartImportHttpError";
  }
}

export class StartImportResponseContractError extends Error {
  readonly code = "START_IMPORT_RESPONSE_CONTRACT_FAILURE" as const;

  constructor() {
    super("Start import produced an invalid public response.");
    this.name = "StartImportResponseContractError";
  }
}
