import { describe, expect, it } from "vitest";

import {
  attachVerifiedPrincipal,
  extractUserContext,
  requireAuthenticatedUserContext,
} from "./user-context.js";

const userId = "1ecf3f80-1038-4fe0-b50a-c47c78494a42";

describe("authenticated user context", () => {
  it("extracts a minimal immutable context from a verified synthetic principal", () => {
    const request = {
      headers: {
        authorization: "Bearer ignored",
        "x-user-id": "9bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e",
      },
      body: { privateValue: "must not pass through" },
    };

    attachVerifiedPrincipal(request, {
      verification: "verified",
      userId,
      authenticationSubject: "subject-opaque-123",
      correlationId: "correlation-123",
      requestId: "request-123",
    });

    const context = requireAuthenticatedUserContext(request);
    expect(context).toEqual({
      state: "authenticated",
      userId,
      authenticationSubject: "subject-opaque-123",
      correlationId: "correlation-123",
      requestId: "request-123",
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(context).not.toHaveProperty("headers");
    expect(context).not.toHaveProperty("body");
  });

  it("distinguishes missing and malformed trusted context", () => {
    expect(extractUserContext({ headers: { "x-user-id": userId } })).toEqual({
      state: "unauthenticated",
    });
    expect(() => requireAuthenticatedUserContext({})).toThrowError(
      expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }),
    );

    const malformedRequest = {};
    attachVerifiedPrincipal(malformedRequest, {
      verification: "verified",
      userId: "email@example.invalid",
    });

    expect(extractUserContext(malformedRequest)).toEqual({
      state: "malformed",
      code: "MALFORMED_AUTHENTICATED_CONTEXT",
    });
    expect(() =>
      requireAuthenticatedUserContext(malformedRequest),
    ).toThrowError(
      expect.objectContaining({ code: "MALFORMED_AUTHENTICATED_CONTEXT" }),
    );
  });

  it("ignores arbitrary identity and JWT-like headers", () => {
    const request = {
      headers: {
        "x-user-id": userId,
        authorization: "Bearer header.payload.signature",
        cookie: "userId=trusted-looking",
      },
    };

    expect(extractUserContext(request)).toEqual({
      state: "unauthenticated",
    });
  });
});
