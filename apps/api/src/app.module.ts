import { Module } from "@nestjs/common";
import { DatabaseReadinessService } from "./health/database-readiness.service";
import { HealthController } from "./health/health.controller";
import { ApiPersistenceModule } from "./persistence/api-persistence.module";

@Module({
  imports: [ApiPersistenceModule],
  controllers: [HealthController],
  providers: [DatabaseReadinessService],
})
export class AppModule {}
