import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from "@nestjs/common";
import {
  importResumeResponseSchemaVersion,
  manualDraftErrorResponseSchema,
} from "@nuvitae/contracts";
import { randomUUID } from "node:crypto";
import { OwnedResourceNotFoundError } from "../auth/ownership.js";
import { ManualResumeHttpError } from "./manual-resume.errors.js";

@Catch()
@Injectable()
export class ManualResumeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    if (exception instanceof ManualResumeHttpError) {
      response.status(exception.getStatus()).json(
        manualDraftErrorResponseSchema.parse({
          version: importResumeResponseSchemaVersion,
          requestId: randomUUID(),
          status: "manual_draft_error",
          code: exception.code,
          userMessage: exception.message,
          ...(exception.issues === undefined
            ? {}
            : {
                issues: exception.issues.map((issue) => ({
                  path: issue.path,
                  message: issue.message,
                })),
              }),
        }),
      );
      return;
    }
    if (exception instanceof OwnedResourceNotFoundError) {
      response.status(404).json(
        manualDraftErrorResponseSchema.parse({
          version: importResumeResponseSchemaVersion,
          requestId: randomUUID(),
          status: "manual_draft_error",
          code: "not_found",
          userMessage: "Draft not found.",
        }),
      );
      return;
    }
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    response.status(503).json(
      manualDraftErrorResponseSchema.parse({
        version: importResumeResponseSchemaVersion,
        requestId: randomUUID(),
        status: "manual_draft_error",
        code: "temporarily_unavailable",
        userMessage: "Manual resume drafts are temporarily unavailable.",
      }),
    );
  }
}
