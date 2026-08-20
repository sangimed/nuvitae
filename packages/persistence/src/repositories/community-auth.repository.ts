export interface CommunityAuthSessionRecord {
  readonly ownerUserId: string;
  readonly expiresAt: Date;
}

export interface CreateCommunityAuthSessionInput {
  readonly sessionHash: string;
  readonly ownerUserId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** Authentication infrastructure repository; no domain repository is singleton-scoped. */
export interface CommunityAuthRepository {
  ensureOwner(createdAt: Date): Promise<string>;
  createSession(input: CreateCommunityAuthSessionInput): Promise<void>;
  findActiveSession(
    sessionHash: string,
    now: Date,
  ): Promise<CommunityAuthSessionRecord | null>;
  revokeSession(sessionHash: string, revokedAt: Date): Promise<void>;
}
