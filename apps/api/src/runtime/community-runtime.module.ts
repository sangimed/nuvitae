import { Module } from "@nestjs/common";
import { CommunityAuthModule } from "../community-auth/community-auth.module.js";
import {
  ProductRuntimeModule,
  PRODUCT_RUNTIME_CONFIG,
} from "./product-runtime.module.js";
import { readCommunityProductRuntimeConfig } from "./community-product.config.js";

/** Community production composition: product modules plus real session auth. */
@Module({
  imports: [
    CommunityAuthModule,
    ProductRuntimeModule.register({
      configProvider: {
        provide: PRODUCT_RUNTIME_CONFIG,
        useFactory: readCommunityProductRuntimeConfig,
      },
    }),
  ],
})
export class CommunityRuntimeModule {}
