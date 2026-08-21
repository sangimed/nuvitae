import { Module, type DynamicModule } from "@nestjs/common";
import { ImportResumeRuntimeModule } from "../import-resume/import-resume-runtime.module.js";
import { ProviderConnectionsRuntimeModule } from "../provider-connections/provider-connections-runtime.module.js";
import type { ProductRuntimeModuleOptions } from "./product-runtime.config.js";

/** Shared product composition, deliberately independent from auth adapters. */
@Module({})
export class ProductRuntimeModule {
  static register(options: ProductRuntimeModuleOptions): DynamicModule {
    return {
      module: ProductRuntimeModule,
      imports: [
        ImportResumeRuntimeModule.register(options),
        ProviderConnectionsRuntimeModule.register(options),
      ],
    };
  }
}

export {
  PRODUCT_RUNTIME_CONFIG,
  type ProductRuntimeConfig,
  type ProductRuntimeModuleOptions,
} from "./product-runtime.config.js";
