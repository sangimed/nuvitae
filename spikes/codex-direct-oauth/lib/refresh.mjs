export class SingleFlightRefresh {
  #pending = new Map();
  #networkRefreshCount = 0;

  get networkRefreshCount() { return this.#networkRefreshCount; }

  async refresh(connectionId, operation) {
    if (this.#pending.has(connectionId)) return this.#pending.get(connectionId);
    const promise = (async () => {
      this.#networkRefreshCount += 1;
      return await operation();
    })();
    this.#pending.set(connectionId, promise);
    try { return await promise; } finally { this.#pending.delete(connectionId); }
  }
}

export function classifyRefreshResponse({ status, body, timedOut = false }) {
  if (timedOut) return "transport_timeout";
  if (status === 429) return "quota_or_rate_limit";
  if (status === 401) return "authentication_required";
  if (status === 403) return "authentication_required";
  if (status >= 500) return "server_error";
  if (status >= 400) return body?.error === "invalid_grant" ? "invalid_grant" : "authentication_required";
  if (!body || typeof body.access_token !== "string" || typeof body.expires_in !== "number") return "malformed_token_response";
  if (body.refresh_token !== undefined && typeof body.refresh_token !== "string") return "malformed_token_response";
  return "success";
}
