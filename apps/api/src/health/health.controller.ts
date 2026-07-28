import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  bootstrapHealthSchema,
  type BootstrapHealth,
} from "@nuvitae/contracts";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({
    description: "API liveness status",
  })
  getHealth(): BootstrapHealth {
    return bootstrapHealthSchema.parse({
      service: "api",
      status: "ok",
    });
  }
}
