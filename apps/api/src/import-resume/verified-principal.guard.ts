/**
 * @deprecated Import the shared access boundary from `../auth` instead.
 * Kept as a source-compatible bridge until downstream tests and consumers have
 * completed one deprecation cycle.
 */
export {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../auth/verified-principal.guard.js";
