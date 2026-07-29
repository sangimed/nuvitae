import { Module } from "@nestjs/common";
import { DatabaseReadinessService } from "./health/database-readiness.service";
import { HealthController } from "./health/health.controller";
import { ApiPersistenceModule } from "./persistence/api-persistence.module";
import { ManualResumeModule } from "./manual-resume/manual-resume.module";

@Module({
  imports: [ApiPersistenceModule, ManualResumeModule],
  controllers: [HealthController],
  providers: [DatabaseReadinessService],
})
export class AppModule {}
