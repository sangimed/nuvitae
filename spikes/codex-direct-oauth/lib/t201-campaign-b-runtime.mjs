import { T201_IMMUTABLE_IMAGE_ENV, verifyPreparedT201Image } from "./t201-image-contract.mjs";

const forbidden = new Set(["build", "pull", "tag"]);

function inspectImage(value) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.Image ?? null;
}

// This deliberately accepts an injected executor so the exact topology can be
// rehearsed without the broker, provider environment, or preserved volumes.
// A future B01 caller supplies its container overlays only after this gate.
export async function validateCampaignBExecutionTopology({ root, preparedImage, preflight, execute, brokerContainer, readerContainer, composeProject = "codex-direct-oauth" } = {}) {
  if (preflight?.success !== true) throw new Error("campaign_b_preflight_required");
  const commands = [];
  const run = async (operation, executable, args, env = process.env) => {
    if (args.some((value) => forbidden.has(String(value)))) throw new Error(`campaign_b_prohibited_after_preflight_${operation}`);
    const raw = await execute({ executable, args, cwd: root, env });
    commands.push({ operation, executable, args });
    if (!raw?.process_started || raw.timed_out || raw.exit_code !== 0) throw new Error(`campaign_b_${operation}_failed`);
    return raw;
  };
  const prepared = await verifyPreparedT201Image({ root, preparedImage, execute: ({ executable, args, cwd, env }) => run("prepared_image_reinspection", executable, args, env) });
  const env = { ...process.env, [T201_IMMUTABLE_IMAGE_ENV]: prepared.reference };
  await run("live_container_creation", "docker", ["compose", "--project-name", composeProject, "create", "--no-build", "t201-semantic", "t201-result-reader"], env);
  const broker = JSON.parse((await run("broker_created_inspection", "docker", ["inspect", brokerContainer])).stdout);
  const reader = JSON.parse((await run("reader_created_inspection", "docker", ["inspect", readerContainer])).stdout);
  if (inspectImage(broker) !== prepared.reference || inspectImage(reader) !== prepared.reference) throw new Error("campaign_b_created_image_mismatch");
  return {
    immutable_image_identity_hash: prepared.identity_hash,
    broker_identity_matches: true,
    reader_identity_matches: true,
    commands,
  };
}
