import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { codexConnectionInitiationResponseSchema } from "@nuvitae/contracts";
import { CodexConnectionInitiationService } from "./codex-connection-initiation.service.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "./verified-principal.guard.js";

@ApiTags("provider connections")
@Controller("import-resume/provider-connections")
export class ProviderConnectionController {
  constructor(
    private readonly connectionInitiation: CodexConnectionInitiationService,
  ) {}

  @Post("codex/oauth/start")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Start the Codex browser connection handoff" })
  @ApiCreatedResponse({ description: "A pending browser connection handoff." })
  @ApiConflictResponse({ description: "A connection is already active." })
  @ApiServiceUnavailableResponse({
    description: "Connection cannot be started.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async begin(@Req() request: object) {
    const authenticated = getGuardedAuthenticatedContext(request);
    try {
      return codexConnectionInitiationResponseSchema.parse(
        await this.connectionInitiation.begin(authenticated.userId),
      );
    } catch (error) {
      throw mapInitiationError(error);
    }
  }
}

function mapInitiationError(error: unknown): HttpException {
  const code =
    error instanceof Error && error.name === "ProviderConnectionError"
      ? (error as { readonly code?: string }).code
      : undefined;
  if (code === "provider_connection_already_connected") {
    return new HttpException(
      {
        statusCode: HttpStatus.CONFLICT,
        code: "connection_already_active",
        message: "Codex is already connected.",
      },
      HttpStatus.CONFLICT,
    );
  }
  return new HttpException(
    {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: "connection_unavailable",
      message: "Codex connection could not be started. Try again later.",
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
