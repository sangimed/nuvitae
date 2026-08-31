import {
  DynamicModule,
  Module,
  type ModuleMetadata,
  type Provider,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { VerifiedPrincipalGuard } from "../auth/verified-principal.guard.js";
import {
  COMMUNITY_FUNNEL_EVENT_EMITTER,
  IMPORT_STATUS_REQUEST_ID_GENERATOR,
} from "./ports/tokens.js";
import { StartImportExceptionFilter } from "./transport/http/start-import-exception.filter.js";
import { StartImportMultipartInterceptor } from "./transport/http/start-import-multipart.interceptor.js";
import { StartImportController } from "./transport/http/start-import.controller.js";
import { ImportStatusController } from "./transport/http/import-status.controller.js";
import { ReviewController } from "./transport/http/review.controller.js";
import {
  ConfirmController,
  ConfirmedStructuredResumeController,
} from "./transport/http/confirm.controller.js";
import { ImportTimingController } from "./transport/http/import-timing.controller.js";
import { CommunityFunnelController } from "./transport/http/community-funnel.controller.js";
import {
  ConfirmStructuredResumeService,
  ImportStatusService,
  ReadImportDraftService,
  StartImportService,
  UpdateImportReviewService,
} from "./use-cases/index.js";

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
        ConfirmController,
        ConfirmedStructuredResumeController,
        ImportTimingController,
        CommunityFunnelController,
      ],
      providers: [
        StartImportService,
        ImportStatusService,
        ReadImportDraftService,
        UpdateImportReviewService,
        ConfirmStructuredResumeService,
        {
          provide: IMPORT_STATUS_REQUEST_ID_GENERATOR,
          useValue: { nextRequestId: () => randomUUID() },
        },
        {
          provide: COMMUNITY_FUNNEL_EVENT_EMITTER,
          useValue: { emit: () => undefined },
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
        ConfirmStructuredResumeService,
      ],
    };
  }
}
