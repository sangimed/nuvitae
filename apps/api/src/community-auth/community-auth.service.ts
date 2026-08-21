import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { CommunityAuthRepository } from "@nuvitae/persistence/ports";

export type { CommunityAuthRepository } from "@nuvitae/persistence/ports";

export class CommunityAuthenticationError extends Error {
  readonly code = "community_authentication_failed";
  readonly publicStatus = 401;

  constructor() {
    super("Authentication failed.");
  }
}

export interface CommunityAuthServiceOptions {
  readonly repository: CommunityAuthRepository;
  readonly accessSecret: string;
  readonly sessionTtlSeconds: number;
  readonly now?: () => Date;
}

export class CommunityAuthService {
  private readonly failedAttemptTimestamps: number[] = [];

  constructor(private readonly options: CommunityAuthServiceOptions) {}

  async authenticate(accessSecret: string): Promise<{
    readonly sessionId: string;
    readonly ownerUserId: string;
    readonly expiresAt: Date;
  }> {
    const now = this.now();
    if (
      !this.allowAttempt(now) ||
      !sameSecret(accessSecret, this.options.accessSecret)
    ) {
      this.recordFailure(now);
      throw new CommunityAuthenticationError();
    }
    const ownerUserId = await this.options.repository.ensureOwner(now);
    const sessionId = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      now.getTime() + this.options.sessionTtlSeconds * 1000,
    );
    await this.options.repository.createSession({
      sessionHash: sessionHash(sessionId),
      ownerUserId,
      createdAt: now,
      expiresAt,
    });
    return { sessionId, ownerUserId, expiresAt };
  }

  async resolve(sessionId: string | undefined): Promise<{
    readonly ownerUserId: string;
  } | null> {
    if (sessionId === undefined || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
      return null;
    }
    const session = await this.options.repository.findActiveSession(
      sessionHash(sessionId),
      this.now(),
    );
    return session === null ? null : { ownerUserId: session.ownerUserId };
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (sessionId === undefined || !/^[A-Za-z0-9_-]{43}$/.test(sessionId))
      return;
    await this.options.repository.revokeSession(
      sessionHash(sessionId),
      this.now(),
    );
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private allowAttempt(now: Date): boolean {
    const cutoff = now.getTime() - 15 * 60 * 1000;
    while (
      this.failedAttemptTimestamps[0] !== undefined &&
      this.failedAttemptTimestamps[0] < cutoff
    ) {
      this.failedAttemptTimestamps.shift();
    }
    return this.failedAttemptTimestamps.length < 8;
  }

  private recordFailure(now: Date): void {
    this.failedAttemptTimestamps.push(now.getTime());
  }
}

function sessionHash(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

function sameSecret(actual: string, expected: string): boolean {
  const actualHash = createHash("sha256").update(actual, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualHash, expectedHash);
}
