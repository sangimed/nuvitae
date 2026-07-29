import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { publicImportStatusResponseSchema } from "@nuvitae/contracts";
import { ImportStatusService } from "./import-status.service.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "./verified-principal.guard.js";

@ApiTags("resume import")
@Controller("import-resume")
export class ImportStatusController {
  constructor(private readonly statusService: ImportStatusService) {}

  @Get(":importId/status")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Read a private resume import status snapshot" })
  @ApiParam({ name: "importId", format: "uuid" })
  @ApiOkResponse({ description: "Owner-scoped import status snapshot." })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async status(@Req() request: object, @Param("importId") importId: string) {
    const authenticated = getGuardedAuthenticatedContext(request);
    return publicImportStatusResponseSchema.parse(
      await this.statusService.readStatus({
        importId,
        ownerUserId: authenticated.userId,
        ...(authenticated.requestId === undefined
          ? {}
          : { requestId: authenticated.requestId }),
      }),
    );
  }
}
