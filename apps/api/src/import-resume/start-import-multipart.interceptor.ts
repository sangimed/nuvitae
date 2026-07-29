import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Observable } from "rxjs";
import type { ImportProcessingLimits } from "../config/import-processing-limits.js";
import { START_IMPORT_PROCESSING_LIMITS } from "./start-import.tokens.js";

@Injectable()
export class StartImportMultipartInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  constructor(
    @Inject(START_IMPORT_PROCESSING_LIMITS)
    limits: ImportProcessingLimits,
  ) {
    const Interceptor = FileInterceptor("file", {
      limits: {
        fileSize: limits.maxUploadSizeBytes,
        files: 1,
        fields: 0,
      },
    });
    this.delegate = new Interceptor();
  }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> | Promise<Observable<unknown>> {
    return this.delegate.intercept(context, next);
  }
}
