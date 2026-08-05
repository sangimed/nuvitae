import type {
  DeniedImportLimitOutcome,
  ImportLimitOutcome,
} from "../services/import-resume/import-limits.js";
import type { StartImportPublicErrorCode } from "./start-import.errors.js";

export interface LimitHttpResponse {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly retryAfterSeconds?: number;
}

export class LimitHttpError extends Error {
  constructor(readonly response: LimitHttpResponse) {
    super(response.message);
    this.name = "LimitHttpError";
  }
}

const messages: Record<string, string> = {
  upload_attempt_limit:
    "You have reached the upload attempt limit. Wait a moment before uploading again.",
  active_job_limit:
    "You already have a resume being processed. Wait for it to finish before uploading another.",
  queued_job_limit:
    "You have too many resumes waiting to be processed. Wait for one to finish before uploading another.",
  processing_start_limit:
    "Resume import capacity is full. Try again in a moment.",
  limit_service_unavailable:
    "Import capacity cannot be checked right now. Try again later.",
};

export function mapLimitOutcomeToHttpResponse(
  outcome: ImportLimitOutcome,
): LimitHttpResponse {
  if (outcome.kind === "allowed") {
    return {
      statusCode: 200,
      code: "accepted",
      message: "Import capacity is available.",
    };
  }
  return mapDeniedOutcome(outcome);
}

function mapDeniedOutcome(
  outcome: DeniedImportLimitOutcome,
): LimitHttpResponse {
  const message =
    messages[outcome.code] ?? "Resume import is temporarily limited.";
  const code = denialCode(outcome.code);

  if (
    outcome.code === "upload_attempt_limit" &&
    outcome.retryAfterSeconds !== undefined
  ) {
    return {
      statusCode: 429,
      code,
      message,
      retryAfterSeconds: outcome.retryAfterSeconds,
    };
  }

  return {
    statusCode: outcome.code === "limit_service_unavailable" ? 503 : 429,
    code,
    message,
  };
}

function denialCode(outcomeCode: string): StartImportPublicErrorCode {
  switch (outcomeCode) {
    case "upload_attempt_limit":
      return "rate_limited";
    case "active_job_limit":
      return "active_job_limit_reached";
    case "queued_job_limit":
      return "queued_job_limit_reached";
    case "processing_start_limit":
      return "processing_start_denied";
    case "limit_service_unavailable":
      return "import_limit_unavailable";
    default:
      return "import_limit_unavailable";
  }
}
