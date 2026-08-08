import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  codexConnectionInitiationResponseSchema,
  providerConnectionStatusResponseSchema,
} from "@nuvitae/contracts";
import { CodexConnectionInitiationService } from "./codex-connection-initiation.service.js";
import { ProviderConnectionError } from "../services/import-resume/provider-connections.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "./verified-principal.guard.js";

@ApiTags("provider connections")
@Controller()
export class ProviderConnectionController {
  constructor(
    private readonly connectionInitiation: CodexConnectionInitiationService,
  ) {}

  @Post("import-resume/provider-connections/codex/oauth/start")
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

  @Get("import-resume/provider-connections/codex/status")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Read the current provider connection status" })
  @ApiOkResponse({ description: "A privacy-safe provider status." })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async readStatus(@Req() request: object) {
    const authenticated = getGuardedAuthenticatedContext(request);
    const status = await this.connectionInitiation.status(authenticated.userId);
    return toPublicStatusResponse(status);
  }

  @Post("import-resume/provider-connections/codex/disconnect")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({
    summary: "Disconnect Codex and remove local connection data",
  })
  @ApiOkResponse({ description: "The privacy-safe disconnected state." })
  @ApiServiceUnavailableResponse({
    description: "The local connection could not be removed safely.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async disconnect(@Req() request: object) {
    const authenticated = getGuardedAuthenticatedContext(request);
    try {
      return toPublicStatusResponse(
        await this.connectionInitiation.disconnect(authenticated.userId),
      );
    } catch (error) {
      throw mapDisconnectError(error);
    }
  }

  @Get([
    "import-resume/provider-connections/codex/oauth/callback",
    "auth/callback",
  ])
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Complete the Codex browser connection callback" })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async completeCallback(
    @Req() request: object,
    @Query() query: Record<string, unknown>,
    @Res() response: { redirect: (status: number, url: string) => void },
  ): Promise<void> {
    const authenticated = getGuardedAuthenticatedContext(request);
    const callback = normalizeCallbackQuery(query);
    try {
      await this.connectionInitiation.completeCallback(
        authenticated.userId,
        callback,
      );
      response.redirect(303, localProductReturnUrl("connected"));
    } catch (error) {
      const safeError = mapCallbackError(error);
      if (safeError.redirect) {
        response.redirect(303, localProductReturnUrl("attention"));
        return;
      }
      throw new HttpException(
        {
          statusCode: safeError.status,
          code: safeError.code,
          message: safeError.message,
        },
        safeError.status,
      );
    }
  }
}

function publicStatusMessage(status: {
  readonly connectionStatus: string;
  readonly authenticationStatus: string;
  readonly availabilityStatus: string;
}): string | null {
  if (status.connectionStatus === "authentication_expired") {
    return "Codex connection expired.";
  }
  if (status.connectionStatus === "authentication_revoked") {
    return "Codex connection needs attention.";
  }
  if (
    status.availabilityStatus === "unavailable" ||
    status.availabilityStatus === "rate_limited" ||
    status.availabilityStatus === "quota_exceeded"
  ) {
    return "Codex is temporarily unavailable.";
  }
  if (
    status.connectionStatus === "connected" &&
    status.authenticationStatus !== "authenticated"
  ) {
    return "Codex connection needs attention.";
  }
  return null;
}

function toPublicStatusResponse(
  status: Awaited<ReturnType<CodexConnectionInitiationService["status"]>>,
) {
  return providerConnectionStatusResponseSchema.parse(
    status === null
      ? {
          version: "2026-08-08",
          providerKind: "codex",
          connectionStatus: "not_configured",
          authenticationStatus: "unauthenticated",
          availabilityStatus: "unknown",
          ready: false,
          safeMessage: null,
        }
      : {
          version: "2026-08-08",
          providerKind: status.providerKind,
          connectionStatus: status.connectionStatus,
          authenticationStatus: status.authenticationStatus,
          availabilityStatus: status.availabilityStatus,
          ready: status.ready,
          safeMessage: publicStatusMessage(status),
        },
  );
}

function normalizeCallbackQuery(query: Record<string, unknown>) {
  const state = boundedQueryValue(query.state, 256);
  if (state === undefined) {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        code: "callback_invalid",
        message: "This Codex connection callback is no longer valid.",
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  const providerError = boundedQueryValue(query.error, 64);
  if (providerError !== undefined) {
    return {
      state,
      providerError:
        providerError === "access_denied"
          ? ("access_denied" as const)
          : providerError === "temporarily_unavailable"
            ? ("temporarily_unavailable" as const)
            : providerError === "invalid_request"
              ? ("invalid_request" as const)
              : ("unknown" as const),
    };
  }
  const authorizationCode = boundedQueryValue(query.code, 4096);
  if (authorizationCode === undefined) {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        code: "callback_invalid",
        message: "This Codex connection callback is no longer valid.",
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  return { state, authorizationCode };
}

function boundedQueryValue(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    return undefined;
  }
  return value;
}

function mapCallbackError(error: unknown): {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly redirect: boolean;
} {
  if (error instanceof HttpException) {
    return {
      status: error.getStatus(),
      code: "callback_invalid",
      message: "This Codex connection callback is no longer valid.",
      redirect: false,
    };
  }
  if (error instanceof ProviderConnectionError) {
    if (error.code === "provider_connection_login_invalid_state") {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: "callback_invalid",
        message: "This Codex connection callback is no longer valid.",
        redirect: false,
      };
    }
    if (error.code === "provider_connection_login_expired") {
      return {
        status: HttpStatus.GONE,
        code: "callback_expired",
        message: "This Codex connection callback has expired.",
        redirect: false,
      };
    }
  }
  return {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: "callback_unavailable",
    message: "Codex could not be connected right now. Try again later.",
    redirect: true,
  };
}

function localProductReturnUrl(outcome: "connected" | "attention"): string {
  const configured = process.env.NUVITAE_CODEX_OAUTH_RETURN_URL;
  const candidate = configured ?? "http://localhost:3000/import-resume";
  try {
    const url = new URL(candidate);
    const allowedHost = new Set(["localhost", "127.0.0.1", "::1"]);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !allowedHost.has(url.hostname) ||
      url.pathname !== "/import-resume" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error("unsafe_return_url");
    }
    url.searchParams.set("codex", outcome);
    return url.toString();
  } catch {
    return `http://localhost:3000/import-resume?codex=${outcome}`;
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

function mapDisconnectError(error: unknown): HttpException {
  const code =
    error instanceof ProviderConnectionError ? error.code : undefined;
  if (code === "provider_connection_state_conflict") {
    return new HttpException(
      {
        statusCode: HttpStatus.CONFLICT,
        code: "connection_state_conflict",
        message: "Codex cannot be disconnected while it is still connecting.",
      },
      HttpStatus.CONFLICT,
    );
  }
  return new HttpException(
    {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: "disconnect_unavailable",
      message: "Codex could not be disconnected safely. Try again later.",
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
