import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CommunityAuthService,
  type CommunityAuthRepository,
} from "./community-auth.service.js";

const ownerUserId = "10000000-0000-4000-8000-000000000001";
const accessSecret = "community-access-secret-for-tests-must-be-long-enough";

function repository(): CommunityAuthRepository {
  const sessions = new Map<
    string,
    {
      readonly ownerUserId: string;
      readonly expiresAt: Date;
      revokedAt: Date | null;
    }
  >();
  return {
    ensureOwner: async () => ownerUserId,
    createSession: async (input) => {
      sessions.set(input.sessionHash, {
        ownerUserId: input.ownerUserId,
        expiresAt: input.expiresAt,
        revokedAt: null,
      });
    },
    findActiveSession: async (sessionHash, now) => {
      const session = sessions.get(sessionHash);
      if (
        session === undefined ||
        session.revokedAt !== null ||
        session.expiresAt <= now
      ) {
        return null;
      }
      return { ownerUserId: session.ownerUserId, expiresAt: session.expiresAt };
    },
    revokeSession: async (sessionHash, revokedAt) => {
      const session = sessions.get(sessionHash);
      if (session !== undefined) session.revokedAt = revokedAt;
    },
  };
}

describe("CommunityAuthService", () => {
  it("establishes one stable owner session and resolves it as a verified principal", async () => {
    const service = new CommunityAuthService({
      repository: repository(),
      accessSecret,
      sessionTtlSeconds: 60,
      now: () => new Date("2026-08-18T00:00:00.000Z"),
    });

    const session = await service.authenticate(accessSecret);
    expect(session.ownerUserId).toBe(ownerUserId);
    expect(session.sessionId).not.toContain(accessSecret);
    await expect(service.resolve(session.sessionId)).resolves.toEqual({
      ownerUserId,
    });
  });

  it("fails closed for malformed, tampered, expired, and revoked sessions", async () => {
    let now = new Date("2026-08-18T00:00:00.000Z");
    const service = new CommunityAuthService({
      repository: repository(),
      accessSecret,
      sessionTtlSeconds: 1,
      now: () => now,
    });
    const session = await service.authenticate(accessSecret);

    await expect(service.resolve("malformed")).resolves.toBeNull();
    await expect(service.resolve(`${session.sessionId}x`)).resolves.toBeNull();
    now = new Date("2026-08-18T00:00:02.000Z");
    await expect(service.resolve(session.sessionId)).resolves.toBeNull();

    now = new Date("2026-08-18T00:00:00.000Z");
    const liveSession = await service.authenticate(accessSecret);
    await service.logout(liveSession.sessionId);
    await expect(service.resolve(liveSession.sessionId)).resolves.toBeNull();
  });

  it("does not reveal whether an access secret was close to valid", async () => {
    const service = new CommunityAuthService({
      repository: repository(),
      accessSecret,
      sessionTtlSeconds: 60,
    });

    await expect(
      service.authenticate("wrong-access-secret"),
    ).rejects.toMatchObject({
      code: "community_authentication_failed",
      publicStatus: 401,
    });
    await expect(
      service.authenticate(accessSecret.slice(0, -1)),
    ).rejects.toMatchObject({
      code: "community_authentication_failed",
      publicStatus: 401,
    });
  });

  it("persists only a one-way session representation", async () => {
    let storedHash = "";
    const store = repository();
    const service = new CommunityAuthService({
      repository: {
        ...store,
        createSession: async (input) => {
          storedHash = input.sessionHash;
          await store.createSession(input);
        },
      },
      accessSecret,
      sessionTtlSeconds: 60,
    });

    const session = await service.authenticate(accessSecret);
    expect(storedHash).toBe(
      createHash("sha256").update(session.sessionId).digest("hex"),
    );
    expect(storedHash).not.toBe(session.sessionId);
  });
});
