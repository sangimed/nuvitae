export const UPSTREAM_REVISIONS = Object.freeze({
  openclaw: "4c331166c40cccb6e4d2da1136c921faed1cc8c1",
  hermesAgent: "5d6aae02bffa7714c4a94f3a0900b37774442dea",
  officialCodex: "3016671bb077c43448b8fa88f3edfa9772e17058",
});

const redirectHost = process.env.CODEX_DIRECT_OAUTH_REDIRECT_HOST ?? "localhost";

export const OAUTH = Object.freeze({
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
  tokenEndpoint: "https://auth.openai.com/oauth/token",
  redirectUri: `http://${redirectHost}:1455/auth/callback`,
  allowedRedirectHosts: Object.freeze(["localhost", "127.0.0.1", "::1"]),
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
  ipv6PublicHost: "::1",
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

export const CODEX_TRANSPORT = Object.freeze({
  backendOrigin: "https://chatgpt.com",
  backendPath: "/backend-api/codex/responses",
  model: "gpt-5.6-sol",
  originator: "openclaw",
  userAgent: "nuvitae-t200-codex-direct-oauth-spike/0.0.0",
  marker: "NUVITAE_T200_OK",
  requestTimeoutMs: 30000,
  idleTimeoutMs: 15000,
  responseMaxBytes: 262144,
  eventMaxCount: 80,
  normalizedOutputMaxBytes: 8192,
});

export const SAFE_FINAL_STATES = Object.freeze({
  success: "success_credentials_destroyed",
  incomplete: "incomplete_cleaned_up",
  failedSecurity: "security_blocker_cleaned_up",
});
