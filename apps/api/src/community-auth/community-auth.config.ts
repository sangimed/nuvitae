import { z } from "zod";

const knownInsecureSecrets = [
  "change-me",
  "replace-me",
  "example",
  "<generate-",
  "<replace-",
  "local-play",
];

export interface CommunityAuthConfig {
  readonly accessSecret: string;
  readonly cookieSecure: boolean;
  readonly sessionTtlSeconds: number;
}

export function readCommunityAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): CommunityAuthConfig {
  const invalid: string[] = [];
  const accessSecret = env.NUVITAE_COMMUNITY_ACCESS_SECRET?.trim() ?? "";
  if (
    accessSecret.length < 32 ||
    knownInsecureSecrets.some((value) =>
      accessSecret.toLowerCase().includes(value),
    )
  ) {
    invalid.push("NUVITAE_COMMUNITY_ACCESS_SECRET");
  }
  const cookieSecureRaw = env.NUVITAE_COMMUNITY_COOKIE_SECURE;
  if (cookieSecureRaw !== "true" && cookieSecureRaw !== "false") {
    invalid.push("NUVITAE_COMMUNITY_COOKIE_SECURE");
  }
  if (env.NODE_ENV === "production" && cookieSecureRaw !== "true") {
    invalid.push("NUVITAE_COMMUNITY_COOKIE_SECURE");
  }
  const ttl = z.coerce
    .number()
    .int()
    .min(300)
    .max(7 * 24 * 60 * 60)
    .safeParse(env.NUVITAE_COMMUNITY_SESSION_TTL_SECONDS ?? "86400");
  if (!ttl.success) invalid.push("NUVITAE_COMMUNITY_SESSION_TTL_SECONDS");
  if (invalid.length > 0) {
    throw new Error(
      `Invalid Community authentication configuration: ${[...new Set(invalid)].join(", ")}.`,
    );
  }
  return {
    accessSecret,
    cookieSecure: cookieSecureRaw === "true",
    sessionTtlSeconds: ttl.data ?? 86400,
  };
}
