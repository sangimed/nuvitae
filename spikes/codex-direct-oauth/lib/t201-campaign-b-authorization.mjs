import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const CAMPAIGN_B_AUTHORIZATION_REGISTRY = "campaign-b-authorizations.json";
export const CAMPAIGN_B_CANONICAL_TARGETS = Object.freeze([
  "run-t201-live.sh",
  "t201-campaign-b-runner.mjs",
  "run-t201-live-execute.sh",
]);

const OPTION_TO_FIELD = Object.freeze({
  "--campaign": "campaign",
  "--attempt": "attempt",
  "--semantic-case": "semantic_case",
  "--fixture": "fixture",
  "--manifest": "manifest",
  "--evidence": "evidence",
  "--max-broker-runs": "maximum_live_broker_runs",
  "--max-semantic-backend-requests": "maximum_semantic_backend_requests",
  "--automatic-retries": "automatic_retries",
});
const REQUIRED_FIELDS = Object.freeze(Object.values(OPTION_TO_FIELD));
const hashFile = async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");

function authorizationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeNumber(value, field) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(String(value))) throw authorizationError(`campaign_b_invalid_${field}`);
  return Number(value);
}

export function parseCampaignBAttemptArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const field = OPTION_TO_FIELD[option];
    if (!field || index + 1 >= argv.length || Object.hasOwn(values, field)) throw authorizationError("campaign_b_invalid_arguments");
    values[field] = argv[index + 1];
    index += 1;
  }
  if (Object.keys(values).length !== REQUIRED_FIELDS.length || REQUIRED_FIELDS.some((field) => !Object.hasOwn(values, field))) throw authorizationError("campaign_b_explicit_contract_required");
  return {
    ...values,
    maximum_live_broker_runs: normalizeNumber(values.maximum_live_broker_runs, "maximum_live_broker_runs"),
    maximum_semantic_backend_requests: normalizeNumber(values.maximum_semantic_backend_requests, "maximum_semantic_backend_requests"),
    automatic_retries: normalizeNumber(values.automatic_retries, "automatic_retries"),
  };
}

export async function loadCampaignBAuthorizationRegistry({ root, registry = CAMPAIGN_B_AUTHORIZATION_REGISTRY } = {}) {
  let parsed;
  try { parsed = JSON.parse(await fs.readFile(path.join(root, registry), "utf8")); } catch { throw authorizationError("campaign_b_authorization_registry_invalid"); }
  if (parsed?.schema_version !== 1 || !Array.isArray(parsed.authorized_attempts)) throw authorizationError("campaign_b_authorization_registry_invalid");
  return parsed;
}

async function defaultIsTracked(root, target) {
  return await new Promise((resolve) => {
    const child = spawn("git", ["ls-files", "--error-unmatch", "--", target], { cwd: root, shell: false, stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

export async function validateCampaignBAuthorization({ root, invocation, registry, exists = fs.access, isTracked = defaultIsTracked } = {}) {
  const selectedRegistry = registry ?? await loadCampaignBAuthorizationRegistry({ root });
  const matches = selectedRegistry.authorized_attempts.filter((entry) => entry.campaign === invocation.campaign && entry.attempt === invocation.attempt);
  if (matches.length !== 1) throw authorizationError("campaign_b_attempt_not_authorized");
  const authorization = matches[0];
  for (const field of REQUIRED_FIELDS) if (invocation[field] !== authorization[field]) throw authorizationError(`campaign_b_contract_mismatch_${field}`);
  if (invocation.campaign.includes("-A") || !/^B[0-9]{2,}$/.test(invocation.attempt)) throw authorizationError("campaign_b_attempt_not_authorized");
  if (invocation.maximum_live_broker_runs !== 1 || invocation.maximum_semantic_backend_requests !== 1) throw authorizationError("campaign_b_single_request_required");
  if (invocation.automatic_retries !== 0) throw authorizationError("campaign_b_retries_disabled_required");
  if (!/^spikes\/codex-direct-oauth\/evidence\/codex-direct-oauth-t201-[a-z0-9-]+-b[0-9]+-semantic-parsing\.json$/.test(invocation.evidence) || invocation.evidence.endsWith("t201-semantic-parsing.json")) throw authorizationError("campaign_b_default_evidence_forbidden");
  const evidencePath = path.join(root, "../..", invocation.evidence);
  try { await exists(evidencePath); throw authorizationError("campaign_b_evidence_path_reused"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const fixturePath = path.join(root, "../..", invocation.fixture);
  const manifestPath = path.join(root, "../..", invocation.manifest);
  if (await hashFile(fixturePath) !== authorization.fixture_sha256 || await hashFile(manifestPath) !== authorization.manifest_sha256) throw authorizationError("campaign_b_matrix_artifact_hash_mismatch");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (manifest.fixture_id !== invocation.semantic_case) throw authorizationError("campaign_b_fixture_manifest_binding_mismatch");
  for (const target of CAMPAIGN_B_CANONICAL_TARGETS) {
    try { await exists(path.join(root, target)); } catch { throw authorizationError("campaign_b_canonical_target_missing"); }
    if (!await isTracked(root, target)) throw authorizationError("campaign_b_canonical_target_untracked");
  }
  const executionBody = await fs.readFile(path.join(root, "run-t201-live-execute.sh"), "utf8");
  if (/\bB(?:01|02|03)\b/.test(executionBody) || /run-t201-live\.sh/.test(executionBody)) throw authorizationError("campaign_b_mutable_image_fallback_present");
  return Object.freeze({ ...authorization, ...invocation, fixture_path: fixturePath, manifest_path: manifestPath, evidence_path: evidencePath });
}
