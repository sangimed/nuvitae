import {
  ArgumentsHost,
  Catch,
  HttpException,
  type ExceptionFilter,
} from "@nestjs/common";
import { StartImportHttpError } from "./start-import.errors.js";

interface HttpResponse {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

@Catch()
export class StartImportExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const mapped = mapException(exception);
    if (mapped.retryAfterSeconds !== undefined) {
      response.setHeader("Retry-After", String(mapped.retryAfterSeconds));
    }
    response.status(mapped.statusCode).json({
      statusCode: mapped.statusCode,
      code: mapped.code,
      message: mapped.message,
    });
  }
}

function mapException(exception: unknown): {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly retryAfterSeconds?: number;
} {
  if (exception instanceof StartImportHttpError) {
    return {
      statusCode: exception.status,
      code: exception.code,
      message: exception.userMessage,
      ...(exception.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: exception.retryAfterSeconds }),
    };
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    if (statusCode === 401) {
      return {
        statusCode,
        code: "authentication_required",
        message: "Sign in before uploading a resume.",
      };
    }
    if (statusCode === 413) {
      return {
        statusCode,
        code: "oversized_file",
        message: "Choose a resume within the upload size limit.",
      };
    }
    if (statusCode === 400) {
      return {
        statusCode,
        code: "unsafe_upload_metadata",
        message: "Upload exactly one resume file in the file field.",
      };
    }
    if (
      body !== null &&
      typeof body === "object" &&
      "code" in body &&
      "message" in body &&
      typeof body.code === "string" &&
      typeof body.message === "string"
    ) {
      return { statusCode, code: body.code, message: body.message };
    }
  }

  if (isMulterError(exception)) {
    return exception.code === "LIMIT_FILE_SIZE"
      ? {
          statusCode: 413,
          code: "oversized_file",
          message: "Choose a resume within the upload size limit.",
        }
      : {
          statusCode: 400,
          code: "unsafe_upload_metadata",
          message: "Upload exactly one resume file in the file field.",
        };
  }

  return {
    statusCode: 500,
    code: "internal_failure",
    message: "The resume import could not be started.",
  };
}

function isMulterError(
  exception: unknown,
): exception is { readonly name: "MulterError"; readonly code: string } {
  return (
    exception instanceof Error &&
    exception.name === "MulterError" &&
    "code" in exception &&
    typeof exception.code === "string"
  );
}
