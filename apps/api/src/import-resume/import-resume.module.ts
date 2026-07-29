import {
  DynamicModule,
  Module,
  type ModuleMetadata,
  type Provider,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { StartImportController } from "./start-import.controller.js";
import { StartImportExceptionFilter } from "./start-import-exception.filter.js";
import { StartImportMultipartInterceptor } from "./start-import-multipart.interceptor.js";
import { StartImportService } from "./start-import.service.js";
import { VerifiedPrincipalGuard } from "./verified-principal.guard.js";
import { ImportStatusController } from "./import-status.controller.js";
import { ImportStatusService } from "./import-status.service.js";
import { IMPORT_STATUS_REQUEST_ID_GENERATOR } from "./start-import.tokens.js";
import { ReviewController } from "./review.controller.js";
import { ReadImportDraftService } from "../services/import-resume/read-draft.js";
import { UpdateImportReviewService } from "../services/import-resume/update-review.js";

export interface ImportResumeModuleOptions {
  readonly imports?: ModuleMetadata["imports"];
  readonly providers: readonly Provider[];
}

/**
 * This feature is intentionally not imported by AppModule yet. A credential-
 * verifying principal adapter and a production atomic import-limit store must
 * be supplied honestly before the route can be enabled in production.
 */
@Module({})
export class ImportResumeModule {
  static register(options: ImportResumeModuleOptions): DynamicModule {
    return {
      module: ImportResumeModule,
      imports: options.imports === undefined ? [] : [...options.imports],
      controllers: [
        StartImportController,
        ImportStatusController,
        ReviewController,
      ],
      providers: [
        StartImportService,
        ImportStatusService,
        ReadImportDraftService,
        UpdateImportReviewService,
        {
          provide: IMPORT_STATUS_REQUEST_ID_GENERATOR,
          useValue: { nextRequestId: () => randomUUID() },
        },
        VerifiedPrincipalGuard,
        StartImportMultipartInterceptor,
        StartImportExceptionFilter,
        ...options.providers,
      ],
      exports: [
        StartImportService,
        ImportStatusService,
        ReadImportDraftService,
        UpdateImportReviewService,
      ],
    };
  }
}
