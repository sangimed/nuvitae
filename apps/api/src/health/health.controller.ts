import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  bootstrapHealthSchema,
  type BootstrapHealth,
} from "@nuvitae/contracts";
import { DatabaseReadinessService } from "./database-readiness.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly databaseReadiness: DatabaseReadinessService) {}

  @Get("live")
  @ApiOkResponse({
    description: "API process liveness",
  })
  getLiveness(): BootstrapHealth {
    return bootstrapHealthSchema.parse({
      service: "api",
      status: "ok",
    });
  }

  @Get()
  @ApiOkResponse({
    description: "API readiness after PostgreSQL connectivity is verified",
  })
  @ApiServiceUnavailableResponse({
    description: "API is not ready",
  })
  async getReadiness(): Promise<BootstrapHealth> {
    try {
      await this.databaseReadiness.probe();
      return bootstrapHealthSchema.parse({
        service: "api",
        status: "ok",
      });
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "database_unavailable",
        message: "Service is not ready.",
      });
    }
  }
}
