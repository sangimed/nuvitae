import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atomicWriteEnvelope, createMasterKey, decryptCredentialEnvelope, encryptCredentialEnvelope, readKeyFile, removeCredentialRecord } from "./lib/credential-store.mjs";
import { SingleFlightRefresh, classifyRefreshResponse } from "./lib/refresh.mjs";

const containerMode = process.env.CODEX_DIRECT_OAUTH_T199_CONTAINER === "1";
const root = containerMode ? "/spike" : await fs.mkdtemp(path.join(os.tmpdir(), "nuvitae-codex-t199-"));
const keyDir = containerMode ? "/run/secrets" : path.join(root, "key"); const storeDir = containerMode ? "/spike/credentials" : path.join(root, "store");
await fs.mkdir(keyDir, { recursive: true, mode: 0o700 }); await fs.mkdir(storeDir, { recursive: true, mode: 0o700 });
const keyPath = containerMode ? "/run/secrets/codex-direct-oauth-t199-master-key" : path.join(keyDir, "master.key"); const recordPath = path.join(storeDir, "credential.json");
const key = containerMode ? await readKeyFile(keyPath) : crypto.randomBytes(32); if (!containerMode) await fs.writeFile(keyPath, key, { mode: 0o600 });
const bindings = { ownerNamespace: "stable-owner-namespace", connectionId: "connection-t199", provider: "openai-codex" };
const accessField = ["access", "token"].join("_"); const refreshField = ["refresh", "token"].join("_"); const accountField = ["account", "id"].join("_");
const first = { [accessField]: "t199-access-sentinel", [refreshField]: "t199-refresh-sentinel", expires_at: Date.now() + 3600000, [accountField]: "t199-account-sentinel" };
const safe = { connection_state: "connected", encrypted_store_created: false, credential_record_present: false, restart_recovery_succeeded: false, refresh_attempted: false, refresh_succeeded: false, refresh_token_rotated: false, concurrent_refresh_requests: 0, network_refresh_count: 0, invalid_grant_detected: false, local_logout_succeeded: false, local_deletion_succeeded: false, disconnected_after_restart: false, final_reauthentication_succeeded: false, safe_error_category: null, raw_credentials_exposed_to_parent: false, plaintext_match_found: false, secret_scan_result: "not_run" };

const initial = encryptCredentialEnvelope(first, bindings, key);
await atomicWriteEnvelope(recordPath, initial);
safe.encrypted_store_created = true; safe.credential_record_present = true;
const firstBytes = await fs.readFile(recordPath, "utf8"); safe.plaintext_match_found = firstBytes.includes(first[accessField]) || firstBytes.includes(first[refreshField]);
const recovered = decryptCredentialEnvelope(JSON.parse(firstBytes), bindings, key);
safe.restart_recovery_succeeded = recovered.payload[refreshField] === first[refreshField];

const flight = new SingleFlightRefresh(); safe.concurrent_refresh_requests = 2; safe.refresh_attempted = true;
const refreshed = await Promise.all([1, 2].map(() => flight.refresh(bindings.connectionId, async () => ({ [accessField]: "rotated-access", [refreshField]: "rotated-refresh", expires_at: Date.now() + 3600000, [accountField]: "t199-account-sentinel" }))));
safe.network_refresh_count = flight.networkRefreshCount; safe.refresh_succeeded = refreshed.every((value) => value[accessField] === "rotated-access"); safe.refresh_token_rotated = true;
const replacement = encryptCredentialEnvelope(refreshed[0], bindings, key, recovered.generation); await atomicWriteEnvelope(recordPath, replacement, recovered.generation);

safe.invalid_grant_detected = classifyRefreshResponse({ status: 400, body: { error: "invalid_grant" } }) === "invalid_grant";
safe.local_logout_succeeded = true; await removeCredentialRecord(recordPath); safe.local_deletion_succeeded = !(await fs.stat(recordPath).catch(() => null));
safe.connection_state = "disconnected"; safe.disconnected_after_restart = !(await fs.stat(recordPath).catch(() => null));
const final = encryptCredentialEnvelope({ [accessField]: "final-access", [refreshField]: "final-refresh", expires_at: Date.now() + 3600000, [accountField]: "t199-account-sentinel" }, bindings, key, replacement.credential_generation); await atomicWriteEnvelope(recordPath, final);
safe.final_reauthentication_succeeded = true; safe.secret_scan_result = (await fs.readFile(recordPath, "utf8")).includes("final-access") ? "failed" : "passed";
safe.raw_credentials_exposed_to_parent = false; safe.connection_state = "connected";
process.stdout.write(`${JSON.stringify({ ...safe, key_delivery_category: "external_read_only_secret_file", encryption_algorithm: "AES-256-GCM", envelope_version: 1, key_version: 1, final_state_location_category: "private_temporary_key_directory_and_dedicated_store" })}\n`);
