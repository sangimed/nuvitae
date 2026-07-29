import {
  DynamicModule,
  Module,
  type ModuleMetadata,
  type Provider,
} from "@nestjs/common";
import { StartImportController } from "./start-import.controller.js";
import { StartImportExceptionFilter } from "./start-import-exception.filter.js";
import { StartImportMultipartInterceptor } from "./start-import-multipart.interceptor.js";
import { StartImportService } from "./start-import.service.js";
import { VerifiedPrincipalGuard } from "./verified-principal.guard.js";

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
      controllers: [StartImportController],
      providers: [
        StartImportService,
        VerifiedPrincipalGuard,
        StartImportMultipartInterceptor,
        StartImportExceptionFilter,
        ...options.providers,
      ],
      exports: [StartImportService],
    };
  }
}
