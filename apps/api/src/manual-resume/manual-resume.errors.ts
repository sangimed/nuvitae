import { HttpException } from "@nestjs/common";
import type { ManualDraftValidationIssue } from "@nuvitae/domain";

export class ManualResumeHttpError extends HttpException {
  constructor(
    statusCode: number,
    readonly code:
      | "not_found"
      | "validation_failed"
      | "stale_update"
      | "temporarily_unavailable",
    message: string,
    readonly issues?: readonly ManualDraftValidationIssue[],
  ) {
    super(
      {
        statusCode,
        code,
        message,
      },
      statusCode,
    );
  }
}
