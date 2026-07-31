export const UPSTREAM_REVISIONS = Object.freeze({
  openclaw: "4c331166c40cccb6e4d2da1136c921faed1cc8c1",
  hermesAgent: "5d6aae02bffa7714c4a94f3a0900b37774442dea",
  officialCodex: "3016671bb077c43448b8fa88f3edfa9772e17058",
});

export const OAUTH = Object.freeze({
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
  tokenEndpoint: "https://auth.openai.com/oauth/token",
  redirectUri: "http://localhost:1455/auth/callback",
  scopes: Object.freeze(["openid", "profile", "email", "offline_access"]),
  codeChallengeMethod: "S256",
  authorizationExtras: Object.freeze({
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "openclaw",
  }),
});

export const CALLBACK = Object.freeze({
  publicHost: "127.0.0.1",
  publicPort: 1455,
  relayContainerPort: 2455,
  brokerHost: "127.0.0.1",
  brokerPort: 1455,
  path: "/auth/callback",
  maxRequestBytes: 8192,
  waitTimeoutMs: Number.parseInt(process.env.CODEX_DIRECT_OAUTH_WAIT_MS ?? "300000", 10),
});

export const NETWORK_LIMITS = Object.freeze({
  tokenExchangeTimeoutMs: 15000,
  tokenResponseMaxBytes: 65536,
  relayIdleTimeoutMs: 120000,
  relayMaxConnections: 8,
});

export const SAFE_FINAL_STATES = Object.freeze({
  success: "success_credentials_destroyed",
  incomplete: "incomplete_cleaned_up",
  failedSecurity: "security_blocker_cleaned_up",
});
