const verifiedPrincipalKey: unique symbol = Symbol(
  "nuvitae.verified-authenticated-principal",
);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const opaqueSubjectPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const operationalIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export interface VerifiedPrincipal {
  readonly verification: "verified";
  readonly userId: string;
  readonly authenticationSubject?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
}

interface VerifiedPrincipalCarrier {
  [verifiedPrincipalKey]?: VerifiedPrincipal;
}

export interface AuthenticatedUserContext {
  readonly state: "authenticated";
  readonly userId: string;
  readonly authenticationSubject?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
}

export type UserContextExtraction =
  | { readonly state: "unauthenticated" }
  | {
      readonly state: "malformed";
      readonly code: "MALFORMED_AUTHENTICATED_CONTEXT";
    }
  | AuthenticatedUserContext;

export type AuthenticationContextErrorCode =
  "AUTHENTICATION_REQUIRED" | "MALFORMED_AUTHENTICATED_CONTEXT";

export class AuthenticationContextError extends Error {
  readonly publicStatus = 401;

  constructor(readonly code: AuthenticationContextErrorCode) {
    super(
      code === "AUTHENTICATION_REQUIRED"
        ? "Authentication is required."
        : "Authenticated context is invalid.",
    );
    this.name = "AuthenticationContextError";
  }
}

/**
 * Intended for a future credential-verifying authentication adapter only.
 * This function stores an already-verified principal; it performs no credential
 * verification and never inspects request headers.
 */
export function attachVerifiedPrincipal(
  request: object,
  principal: VerifiedPrincipal,
): void {
  Object.defineProperty(request, verifiedPrincipalKey, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({ ...principal }),
  });
}

export function extractUserContext(request: unknown): UserContextExtraction {
  if (request === null || typeof request !== "object") {
    return { state: "unauthenticated" };
  }

  const principal = (request as VerifiedPrincipalCarrier)[verifiedPrincipalKey];
  if (principal === undefined) {
    return { state: "unauthenticated" };
  }
  if (!isValidVerifiedPrincipal(principal)) {
    return {
      state: "malformed",
      code: "MALFORMED_AUTHENTICATED_CONTEXT",
    };
  }

  return Object.freeze({
    state: "authenticated" as const,
    userId: principal.userId,
    ...(principal.authenticationSubject === undefined
      ? {}
      : { authenticationSubject: principal.authenticationSubject }),
    ...(principal.correlationId === undefined
      ? {}
      : { correlationId: principal.correlationId }),
    ...(principal.requestId === undefined
      ? {}
      : { requestId: principal.requestId }),
  });
}

export function requireAuthenticatedUserContext(
  request: unknown,
): AuthenticatedUserContext {
  const result = extractUserContext(request);
  if (result.state === "unauthenticated") {
    throw new AuthenticationContextError("AUTHENTICATION_REQUIRED");
  }
  if (result.state === "malformed") {
    throw new AuthenticationContextError(result.code);
  }
  return result;
}

function isValidVerifiedPrincipal(
  principal: VerifiedPrincipal,
): principal is VerifiedPrincipal {
  return (
    principal.verification === "verified" &&
    uuidPattern.test(principal.userId) &&
    isOptionalMatch(principal.authenticationSubject, opaqueSubjectPattern) &&
    isOptionalMatch(principal.correlationId, operationalIdPattern) &&
    isOptionalMatch(principal.requestId, operationalIdPattern)
  );
}

function isOptionalMatch(value: string | undefined, pattern: RegExp): boolean {
  return value === undefined || pattern.test(value);
}
