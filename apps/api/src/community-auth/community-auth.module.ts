import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { TypeOrmCommunityAuthRepository } from "@nuvitae/persistence/typeorm";
import { ApiPersistenceModule } from "../persistence/api-persistence.module.js";
import {
  readCommunityAuthConfig,
  type CommunityAuthConfig,
} from "./community-auth.config.js";
import { CommunityAuthController } from "./community-auth.controller.js";
import {
  CommunityAuthMiddleware,
  COMMUNITY_AUTH_SESSION_RESOLVER,
} from "./community-auth.middleware.js";
import { CommunityAuthService } from "./community-auth.service.js";
import {
  COMMUNITY_AUTH_CONFIG,
  COMMUNITY_AUTH_SERVICE,
} from "./community-auth.tokens.js";

export {
  COMMUNITY_AUTH_CONFIG,
  COMMUNITY_AUTH_SERVICE,
} from "./community-auth.tokens.js";

@Module({
  imports: [ApiPersistenceModule],
  controllers: [CommunityAuthController],
  providers: [
    {
      provide: COMMUNITY_AUTH_CONFIG,
      useFactory: (): CommunityAuthConfig => readCommunityAuthConfig(),
    },
    {
      provide: COMMUNITY_AUTH_SERVICE,
      useFactory: (dataSource: DataSource, config: CommunityAuthConfig) =>
        new CommunityAuthService({
          repository: new TypeOrmCommunityAuthRepository(dataSource),
          accessSecret: config.accessSecret,
          sessionTtlSeconds: config.sessionTtlSeconds,
        }),
      inject: [DataSource, COMMUNITY_AUTH_CONFIG],
    },
    {
      provide: COMMUNITY_AUTH_SESSION_RESOLVER,
      useExisting: COMMUNITY_AUTH_SERVICE,
    },
    CommunityAuthMiddleware,
  ],
  exports: [COMMUNITY_AUTH_SERVICE],
})
export class CommunityAuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // SameSite=Strict plus authenticated JSON/multipart mutation routes forms the
    // Community V1 CSRF boundary. Cross-site form posts never carry this cookie.
    consumer
      .apply(CommunityAuthMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.ALL },
        { path: "health/(.*)", method: RequestMethod.ALL },
        { path: "openapi", method: RequestMethod.ALL },
        { path: "openapi/(.*)", method: RequestMethod.ALL },
      )
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
