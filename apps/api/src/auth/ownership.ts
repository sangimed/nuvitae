import type { AuthenticatedUserContext } from "./user-context.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OwnerScopedResource {
  readonly ownerUserId: string;
}

export type OwnershipDecision =
  | {
      readonly allowed: true;
      readonly ownerUserId: string;
    }
  | {
      readonly allowed: false;
      readonly code: "OWNED_RESOURCE_NOT_FOUND";
      readonly publicStatus: 404;
    };

export class OwnedResourceNotFoundError extends Error {
  readonly code = "OWNED_RESOURCE_NOT_FOUND" as const;
  readonly publicStatus = 404 as const;

  constructor() {
    super("Resource not found.");
    this.name = "OwnedResourceNotFoundError";
  }
}

/**
 * Produces the same public denial for malformed, missing, and wrong-owner
 * identifiers. There is deliberately no administrator bypass.
 */
export function authorizeOwnership(
  context: AuthenticatedUserContext,
  resourceOwnerUserId: string | undefined,
): OwnershipDecision {
  if (
    resourceOwnerUserId !== undefined &&
    uuidPattern.test(resourceOwnerUserId) &&
    resourceOwnerUserId === context.userId
  ) {
    return { allowed: true, ownerUserId: resourceOwnerUserId };
  }
  return {
    allowed: false,
    code: "OWNED_RESOURCE_NOT_FOUND",
    publicStatus: 404,
  };
}

/**
 * Accepts resources returned from an owner-scoped repository and preserves
 * non-disclosure if a caller supplies an unscoped result by mistake.
 */
export function requireOwnedResource<T extends OwnerScopedResource>(
  context: AuthenticatedUserContext,
  resource: T | null | undefined,
): T {
  const decision = authorizeOwnership(context, resource?.ownerUserId);
  if (!decision.allowed || resource === null || resource === undefined) {
    throw new OwnedResourceNotFoundError();
  }
  return resource;
}
