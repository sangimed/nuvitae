import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { type CommunityAuthConfig } from "./community-auth.config.js";
import {
  CommunityAuthenticationError,
  CommunityAuthService,
} from "./community-auth.service.js";
import {
  COMMUNITY_AUTH_CONFIG,
  COMMUNITY_AUTH_SERVICE,
} from "./community-auth.tokens.js";
import {
  communitySessionCookieName,
  readCookie,
} from "./community-auth.middleware.js";
import { extractUserContext } from "../auth/user-context.js";

const loginSchema = z.object({ accessSecret: z.string().min(1) }).strict();

interface CookieResponse {
  setHeader(name: string, value: string | string[]): void;
}

@Controller("community-auth")
export class CommunityAuthController {
  constructor(
    @Inject(COMMUNITY_AUTH_SERVICE)
    private readonly auth: CommunityAuthService,
    @Inject(COMMUNITY_AUTH_CONFIG)
    private readonly config: CommunityAuthConfig,
  ) {}

  @Post("session")
  @HttpCode(HttpStatus.NO_CONTENT)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success)
      throw new UnauthorizedException(authenticationResponse());
    try {
      const session = await this.auth.authenticate(parsed.data.accessSecret);
      response.setHeader(
        "Set-Cookie",
        serializeSessionCookie(session.sessionId, this.config),
      );
    } catch (error) {
      if (error instanceof CommunityAuthenticationError) {
        throw new UnauthorizedException(authenticationResponse());
      }
      throw error;
    }
  }

  @Get("session/status")
  status(@Req() request: object): { readonly authenticated: boolean } {
    return {
      authenticated: extractUserContext(request).state === "authenticated",
    };
  }

  @Delete("session")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req()
    request: {
      readonly headers?: Record<string, string | string[] | undefined>;
    },
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.logout(
      readCookie(request.headers?.cookie, communitySessionCookieName),
    );
    response.setHeader("Set-Cookie", clearSessionCookie(this.config));
  }
}

function authenticationResponse() {
  return {
    statusCode: 401,
    code: "authentication_required",
    message: "Owner access is required.",
  };
}

export function serializeSessionCookie(
  sessionId: string,
  config: CommunityAuthConfig,
): string {
  return [
    `${communitySessionCookieName}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${config.sessionTtlSeconds}`,
    ...(config.cookieSecure ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookie(config: CommunityAuthConfig): string {
  return [
    `${communitySessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    ...(config.cookieSecure ? ["Secure"] : []),
  ].join("; ");
}
