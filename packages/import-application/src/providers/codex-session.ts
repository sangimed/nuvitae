/**
 * The only application-level projection of the encrypted Codex session.
 * Callers must keep this value inside the server-side provider boundary. It
 * must never be placed in a queue payload, response, log record, or domain
 * entity.
 */
export interface CodexSessionMaterial {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accountId: string | null;
  readonly expiresAt: Date | null;
}

export function parseCodexSessionMaterial(
  value: Uint8Array,
): CodexSessionMaterial {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(value));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { v?: unknown }).v !== 1 ||
    !nonEmptyString((parsed as { accessToken?: unknown }).accessToken) ||
    !nonEmptyString((parsed as { refreshToken?: unknown }).refreshToken) ||
    !nullableString((parsed as { accountId?: unknown }).accountId) ||
    !nullableString((parsed as { expiresAt?: unknown }).expiresAt)
  ) {
    throw new Error("invalid_session_payload");
  }

  const expiresAtValue = (parsed as { expiresAt: string | null }).expiresAt;
  const expiresAt = expiresAtValue === null ? null : new Date(expiresAtValue);
  if (expiresAt !== null && Number.isNaN(expiresAt.getTime())) {
    throw new Error("invalid_session_expiry");
  }

  return {
    accessToken: (parsed as { accessToken: string }).accessToken,
    refreshToken: (parsed as { refreshToken: string }).refreshToken,
    accountId: (parsed as { accountId: string | null }).accountId,
    expiresAt,
  };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
