import { Module } from "@nestjs/common";
import { DatabaseReadinessService } from "./health/database-readiness.service";
import { HealthController } from "./health/health.controller";
import { ApiPersistenceModule } from "./persistence/api-persistence.module";
import { ManualResumeModule } from "./manual-resume/manual-resume.module";
import { isLocalPlayModeEnv } from "./local-play/local-play.config";
import { LocalPlayRuntimeModule } from "./local-play/local-play-runtime.module";
import { CommunityRuntimeModule } from "./runtime/community-runtime.module";

@Module({
  imports: [
    ApiPersistenceModule,
    ManualResumeModule,
    ...(isLocalPlayModeEnv()
      ? [LocalPlayRuntimeModule]
      : [CommunityRuntimeModule]),
  ],
  controllers: [HealthController],
  providers: [DatabaseReadinessService],
})
export class AppModule {}
