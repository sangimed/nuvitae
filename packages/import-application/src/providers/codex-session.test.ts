import { describe, expect, it } from "vitest";
import { parseCodexSessionMaterial } from "./codex-session.js";

const encoder = new TextEncoder();

describe("parseCodexSessionMaterial", () => {
  it("normalizes explicit provider offsets without local-time drift", () => {
    const session = parseCodexSessionMaterial(
      encodedSession("2026-10-25T02:30:00.000+02:00"),
    );

    expect(session.expiresAt?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("rejects an offset-free provider expiry", () => {
    expect(() =>
      parseCodexSessionMaterial(encodedSession("2026-10-25T02:30:00.000")),
    ).toThrow("invalid_session_expiry");
  });
});

function encodedSession(expiresAt: string): Uint8Array {
  return encoder.encode(
    JSON.stringify({
      v: 1,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accountId: null,
      expiresAt,
    }),
  );
}
