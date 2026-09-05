import { describe, expect, it, vi } from "vitest";
import { CommunityAuthController } from "./community-auth.controller.js";
import { serializeSessionCookie } from "./community-auth.controller.js";
import type { CommunityAuthService } from "./community-auth.service.js";
import { attachVerifiedPrincipal } from "../auth/user-context.js";

const config = {
  accessSecret: "not-exposed",
  cookieSecure: true,
  sessionTtlSeconds: 3600,
};

describe("CommunityAuthController", () => {
  it("issues only an HttpOnly, strict, bounded secure cookie", async () => {
    const authenticate = vi.fn(async () => ({
      sessionId: "A".repeat(43),
      ownerUserId: "10000000-0000-4000-8000-000000000001",
      expiresAt: new Date(),
    }));
    const controller = new CommunityAuthController(
      { authenticate } as unknown as CommunityAuthService,
      config,
    );
    const setHeader = vi.fn();

    await controller.login({ accessSecret: "owner-secret" }, { setHeader });

    const cookie = String(setHeader.mock.calls[0]?.[1]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=3600");
    expect(cookie).not.toContain("owner-secret");
  });

  it("invalidates the server-side session before clearing the cookie", async () => {
    const logout = vi.fn(async () => undefined);
    const controller = new CommunityAuthController(
      { logout } as unknown as CommunityAuthService,
      config,
    );
    const setHeader = vi.fn();

    await controller.logout(
      { headers: { cookie: "nuvitae_community_session=previous-session" } },
      { setHeader },
    );

    expect(logout).toHaveBeenCalledWith("previous-session");
    expect(String(setHeader.mock.calls[0]?.[1])).toContain("Max-Age=0");
    expect(setHeader).toHaveBeenCalledWith(
      "Clear-Site-Data",
      '"cache"',
    );
  });

  it("never serializes auth configuration into a session cookie", () => {
    expect(serializeSessionCookie("A".repeat(43), config)).not.toContain(
      config.accessSecret,
    );
  });

  it("reports session state from the verified-principal seam only", () => {
    const controller = new CommunityAuthController(
      {} as CommunityAuthService,
      config,
    );
    const request = {};
    expect(controller.status(request)).toEqual({ authenticated: false });
    attachVerifiedPrincipal(request, {
      verification: "verified",
      userId: "10000000-0000-4000-8000-000000000001",
    });
    expect(controller.status(request)).toEqual({ authenticated: true });
  });
});
