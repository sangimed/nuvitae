import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { attachVerifiedPrincipal } from "../auth/user-context.js";

export const COMMUNITY_AUTH_SESSION_RESOLVER = Symbol(
  "COMMUNITY_AUTH_SESSION_RESOLVER",
);

export interface CommunityAuthSessionResolver {
  resolve(sessionId: string | undefined): Promise<{
    readonly ownerUserId: string;
  } | null>;
}

export const communitySessionCookieName = "nuvitae_community_session";

@Injectable()
export class CommunityAuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(COMMUNITY_AUTH_SESSION_RESOLVER)
    private readonly sessions: CommunityAuthSessionResolver,
  ) {}

  async use(
    request: {
      readonly headers?: Record<string, string | string[] | undefined>;
    },
    _response: unknown,
    next: () => void,
  ): Promise<void> {
    const owner = await this.sessions.resolve(
      readCookie(request.headers?.cookie, communitySessionCookieName),
    );
    if (owner !== null) {
      attachVerifiedPrincipal(request, {
        verification: "verified",
        userId: owner.ownerUserId,
        authenticationSubject: "community-single-owner",
        requestId: randomUUID(),
      });
    }
    next();
  }
}

export function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  if (typeof header !== "string") return undefined;
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return undefined;
}
