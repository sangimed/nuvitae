// Spike-only credential bootstrap for the live T199/T200/T201 qualification on
// this host. The host already holds a live ChatGPT/Codex session in the Hermes
// Agent credential store (the same audited upstream implementation the spike
// replicates, including the exact OAuth client id and token endpoint). This
// bootstrap re-encrypts that session into the spike's own isolated encrypted
// credential envelope so the broker can prove restart recovery, refresh,
// invocation, and deletion live.
//
// Token material is read only from the mounted source file and written only
// inside the encrypted envelope. Nothing sensitive is printed or persisted in
// repository evidence. The access token is seeded as already expired so the
// broker's bounded single-flight refresh path is exercised before any live
// invocation.
import fs from "node:fs/promises";
import {
  atomicWriteEnvelope,
  encryptCredentialEnvelope,
  readKeyFile,
} from "./lib/credential-store.mjs";

const keyPath = process.env.CODEX_DIRECT_OAUTH_T199_KEY_PATH ?? "/run/t199-key/master.key";
const recordPath =
  process.env.CODEX_DIRECT_OAUTH_T199_CREDENTIAL_PATH ??
  "/spike/credentials/credential.json";
const sourcePath =
  process.env.CODEX_DIRECT_OAUTH_SOURCE_AUTH_JSON ??
  "/spike/hermes-auth.json";
const bindings = {
  ownerNamespace: "live-t199-owner",
  connectionId: "live-t199-connection",
  provider: "openai-codex",
};

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main() {
  let source;
  try {
    source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  } catch {
    emit({ bootstrap_succeeded: false, safe_error_category: "source_auth_unreadable" });
    return 1;
  }
  const tokens = source?.providers?.["openai-codex"]?.tokens ?? null;
  const accessToken =
    typeof tokens?.access_token === "string" ? tokens.access_token : "";
  const refreshToken =
    typeof tokens?.refresh_token === "string" ? tokens.refresh_token : "";
  const accountId =
    typeof tokens?.account_id === "string" ? tokens.account_id : "";
  if (!accessToken || !refreshToken || !accountId) {
    emit({ bootstrap_succeeded: false, safe_error_category: "source_session_incomplete" });
    return 1;
  }

  const key = await readKeyFile(keyPath);
  const payload = {
    access_token: accessToken,
    refresh_token: refreshToken,
    account_id: accountId,
    // Deliberately past expiry: the broker must refresh before any live use.
    issued_at_ms: Date.now() - 120_000,
    expires_at: Date.now() - 60_000,
  };
  const envelope = encryptCredentialEnvelope(payload, bindings, key);
  await atomicWriteEnvelope(recordPath, envelope);
  const stored = await fs.readFile(recordPath, "utf8");
  const plaintextLeak =
    stored.includes(accessToken) || stored.includes(refreshToken);
  emit({
    bootstrap_succeeded: true,
    encrypted_record_created: true,
    encrypted_record_contains_plaintext: plaintextLeak,
    credential_generation: envelope.credential_generation,
    credential_generation_stored: envelope.credential_generation,
    source_session: "hermes-openai-codex-same-oauth-client",
  });
  return plaintextLeak ? 1 : 0;
}

process.exitCode = await main();
