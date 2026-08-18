import { describe, expect, it } from "vitest";
import { extractUserContext } from "../auth/user-context.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../import-resume/verified-principal.guard.js";
import { CommunityAuthMiddleware } from "./community-auth.middleware.js";

const ownerUserId = "10000000-0000-4000-8000-000000000001";

describe("CommunityAuthMiddleware", () => {
  it("attaches a production verified principal only for a server-verified session", async () => {
    const middleware = new CommunityAuthMiddleware({
      resolve: async (value: string) =>
        value === "valid-session" ? { ownerUserId } : null,
    });
    const request = {
      headers: {
        cookie: "nuvitae_community_session=valid-session",
        "x-user-id": "20000000-0000-4000-8000-000000000002",
      },
      query: { ownerUserId: "20000000-0000-4000-8000-000000000002" },
      body: { ownerUserId: "20000000-0000-4000-8000-000000000002" },
    };

    await middleware.use(request, {}, () => undefined);
    expect(extractUserContext(request)).toMatchObject({
      state: "authenticated",
      userId: ownerUserId,
      authenticationSubject: "community-single-owner",
    });
  });

  it("does not accept header, query, or body owner selection without a valid session", async () => {
    const middleware = new CommunityAuthMiddleware({
      resolve: async () => null,
    });
    const request = {
      headers: { "x-user-id": ownerUserId },
      query: { ownerUserId },
      body: { ownerUserId },
    };

    await middleware.use(request, {}, () => undefined);
    expect(extractUserContext(request)).toEqual({ state: "unauthenticated" });
    expect(() =>
      new VerifiedPrincipalGuard().canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
      } as never),
    ).toThrowError(expect.objectContaining({ status: 401 }));
  });

  it("makes the Community owner available to protected controllers only through the guard seam", async () => {
    const middleware = new CommunityAuthMiddleware({
      resolve: async () => ({ ownerUserId }),
    });
    const request = { headers: { cookie: "nuvitae_community_session=valid" } };

    await middleware.use(request, {}, () => undefined);
    expect(
      new VerifiedPrincipalGuard().canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
      } as never),
    ).toBe(true);
    expect(getGuardedAuthenticatedContext(request).userId).toBe(ownerUserId);
  });
});
