import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { readLocalPlayConfig } from "./local-play.config.js";
import { LocalPlayPrincipalMiddleware } from "./local-play-principal.middleware.js";
import {
  ProductRuntimeModule,
  PRODUCT_RUNTIME_CONFIG,
} from "../runtime/product-runtime.module.js";

@Module({
  imports: [
    ProductRuntimeModule.register({
      configProvider: {
        provide: PRODUCT_RUNTIME_CONFIG,
        useFactory: readLocalPlayConfig,
      },
    }),
  ],
})
export class LocalPlayRuntimeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LocalPlayPrincipalMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.ALL },
        { path: "health/(.*)", method: RequestMethod.ALL },
        { path: "openapi", method: RequestMethod.ALL },
        { path: "openapi/(.*)", method: RequestMethod.ALL },
      )
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
