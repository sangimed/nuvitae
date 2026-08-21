import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  requireAuthenticatedUserContext,
  type AuthenticatedUserContext,
} from "./user-context.js";

const authenticatedContextKey: unique symbol = Symbol(
  "nuvitae.auth.verified-principal-context",
);

interface AuthenticatedRequestCarrier {
  [authenticatedContextKey]?: AuthenticatedUserContext;
}

/**
 * Shared HTTP access boundary for every authenticated feature.
 *
 * Principal issuers remain responsible for verifying credentials and attaching
 * the canonical user context. Feature controllers only consume that context.
 */
@Injectable()
export class VerifiedPrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<object>();
    try {
      const authenticated = requireAuthenticatedUserContext(request);
      Object.defineProperty(request, authenticatedContextKey, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: Object.freeze({
          state: "authenticated" as const,
          userId: authenticated.userId,
          ...(authenticated.requestId === undefined
            ? {}
            : { requestId: authenticated.requestId }),
        }),
      });
      return true;
    } catch {
      throw new UnauthorizedException({
        statusCode: 401,
        code: "authentication_required",
        message: "Sign in before accessing this resource.",
      });
    }
  }
}

export function getGuardedAuthenticatedContext(
  request: object,
): AuthenticatedUserContext {
  const authenticated = (request as AuthenticatedRequestCarrier)[
    authenticatedContextKey
  ];
  if (authenticated === undefined) {
    throw new UnauthorizedException({
      statusCode: 401,
      code: "authentication_required",
      message: "Sign in before accessing this resource.",
    });
  }
  return authenticated;
}
