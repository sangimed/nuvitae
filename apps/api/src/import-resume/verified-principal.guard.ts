import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  requireAuthenticatedUserContext,
  type AuthenticatedUserContext,
} from "../auth/user-context.js";

const authenticatedContextKey: unique symbol = Symbol(
  "nuvitae.start-import.authenticated-context",
);

interface AuthenticatedRequestCarrier {
  [authenticatedContextKey]?: AuthenticatedUserContext;
}

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
        message: "Sign in before uploading a resume.",
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
      message: "Sign in before uploading a resume.",
    });
  }
  return authenticated;
}
