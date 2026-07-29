import { describe, expect, it } from "vitest";

import {
  OwnedResourceNotFoundError,
  authorizeOwnership,
  requireOwnedResource,
} from "./ownership.js";
import type { AuthenticatedUserContext } from "./user-context.js";

const context: AuthenticatedUserContext = Object.freeze({
  state: "authenticated",
  userId: "1ecf3f80-1038-4fe0-b50a-c47c78494a42",
});

describe("ownership utilities", () => {
  it("allows an explicit ownership match", () => {
    expect(authorizeOwnership(context, context.userId)).toEqual({
      allowed: true,
      ownerUserId: context.userId,
    });
  });

  it("denies a mismatch without revealing resource existence", () => {
    expect(
      authorizeOwnership(context, "9bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e"),
    ).toEqual({
      allowed: false,
      code: "OWNED_RESOURCE_NOT_FOUND",
      publicStatus: 404,
    });
  });

  it("uses equivalent public outcomes for missing and wrong-owner resources", () => {
    const missing = capturePublicOutcome(() =>
      requireOwnedResource(context, undefined),
    );
    const wrongOwner = capturePublicOutcome(() =>
      requireOwnedResource(context, {
        id: "resource-1",
        ownerUserId: "9bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e",
      }),
    );

    expect(missing).toEqual(wrongOwner);
    expect(missing).toEqual({
      name: "OwnedResourceNotFoundError",
      code: "OWNED_RESOURCE_NOT_FOUND",
      publicStatus: 404,
      message: "Resource not found.",
    });
  });
});

function capturePublicOutcome(operation: () => unknown) {
  try {
    operation();
    throw new Error("Expected ownership operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(OwnedResourceNotFoundError);
    const ownershipError = error as OwnedResourceNotFoundError;
    return {
      name: ownershipError.name,
      code: ownershipError.code,
      publicStatus: ownershipError.publicStatus,
      message: ownershipError.message,
    };
  }
}
