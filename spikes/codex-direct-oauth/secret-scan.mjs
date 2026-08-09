import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containsSecretLikeValue } from "./lib/sanitize.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "../..");
const scanRoots = [
  root,
  path.join(repoRoot, "docs/research/codex-direct-oauth-login.md"),
  path.join(repoRoot, "docs/research/codex-direct-oauth-invocation.md"),
  path.join(repoRoot, "docs/research/codex-direct-oauth-semantic-parsing.md"),
];
const ignoredSegments = new Set(["test"]);
const ignoredSourceLines = [
  "access_token_present",
  "refresh_token_present",
  "tokenResponse.access_token",
  "tokenResponse.refresh_token",
  "access_token: sentinel-access-token-value",
  "refresh_token: sentinel-refresh-token-value",
  "refresh_token: refreshToken",
  "refresh_token: refreshToken,",
  "code=syntheticAuthorizationCode123",
  'accessToken: "synthetic-access"',
  'accessToken: "a"',
  "accessToken: credential.access_token",
  'accountIdentifier: "synthetic-account"',
  'accountIdentifier: "b"',
  'authorization, "Bearer synthetic-access"',
  "alex.exemple@example.invalid",
  "camille.exemple@example.invalid",
  "dana.example@example.invalid",
  "eli.synthetic@example.invalid",
  "noor.fiction@example.invalid",
  "rowan.sample@example.invalid",
  "lea.exemple@example.invalid",
  "jordan.avery@example.test",
  "maya.chen@example.test",
  "anais.moreau@example.invalid",
  "ethan.brooks@example.invalid",
  "amir.hussain@example.invalid",
  "priya.raman@example.invalid",
];

function removeAllowlistedSourceLines(text) {
  return text
    .split("\n")
    .filter(
      (line) => !ignoredSourceLines.some((allowed) => line.includes(allowed)),
    )
    .join("\n");
}

async function filesUnder(target) {
  const stat = await fs.stat(target).catch(() => undefined);
  if (!stat) return [];
  if (stat.isFile()) return [target];
  const entries = await fs.readdir(target, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (ignoredSegments.has(entry.name)) continue;
    results.push(...(await filesUnder(path.join(target, entry.name))));
  }
  return results;
}

if (
  !containsSecretLikeValue("access_token: sentinel-access-token-value") ||
  !containsSecretLikeValue("refresh_token: sentinel-refresh-token-value") ||
  !containsSecretLikeValue("code=syntheticAuthorizationCode123")
) {
  process.stderr.write("sentinel secret scanner self-check failed\n");
  process.exit(1);
}

const findings = [];
for (const scanRoot of scanRoots) {
  for (const file of await filesUnder(scanRoot)) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    if (containsSecretLikeValue(removeAllowlistedSourceLines(text))) {
      findings.push(path.relative(repoRoot, file));
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`secret-like values found:\n${findings.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("secret_scan_result=passed\n");
