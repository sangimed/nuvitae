import { constants } from "node:fs";
import fs from "node:fs/promises";
import {
  decryptCredentialEnvelope,
  readEnvelope,
  readKeyFile,
} from "./credential-store.mjs";

const PRIVATE_FILE_MODE = 0o600;

function blank() {
  return {
    runtime_identity_valid: false,
    key_mount_exists: false,
    key_file_exists: false,
    key_file_type_valid: false,
    key_file_owner_valid: false,
    key_file_mode_valid: false,
    key_file_readable: false,
    credential_mount_exists: false,
    credential_file_exists: false,
    credential_file_type_valid: false,
    credential_file_owner_valid: false,
    credential_file_mode_valid: false,
    credential_file_readable: false,
    envelope_json_parse_succeeded: false,
    envelope_structure_valid: false,
    key_load_succeeded: false,
    envelope_load_succeeded: false,
    credential_decryption_succeeded: false,
    binding_validation_succeeded: false,
    failure_stage: "runtime_identity",
    safe_failure_category: "runtime_identity_failure",
  };
}

function fail(value, stage) {
  value.failure_stage = stage;
  value.safe_failure_category = `${stage}_failure`;
  return value;
}

function validIdentity(identity) {
  return (
    Number.isInteger(identity?.uid) &&
    Number.isInteger(identity?.gid) &&
    identity.uid !== 0
  );
}

function privateRegularFile(stat, identity) {
  return (
    stat.isFile() &&
    stat.uid === identity.uid &&
    stat.gid === identity.gid &&
    (stat.mode & 0o777) === PRIVATE_FILE_MODE
  );
}

function validEnvelopeStructure(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope))
    return false;
  if (
    envelope.envelope_version !== 1 ||
    envelope.key_version !== 1 ||
    envelope.algorithm !== "aes-256-gcm"
  )
    return false;
  if (
    !Number.isInteger(envelope.credential_generation) ||
    envelope.credential_generation < 1
  )
    return false;
  return [
    "owner_binding",
    "connection_binding",
    "provider_binding",
    "nonce",
    "ciphertext",
    "authentication_tag",
  ].every(
    (field) =>
      typeof envelope[field] === "string" && envelope[field].length > 0,
  );
}

function bindingsMatch(envelope, bindings) {
  return (
    envelope.owner_binding === bindings.ownerNamespace &&
    envelope.connection_binding === bindings.connectionId &&
    envelope.provider_binding === bindings.provider
  );
}

async function directoryExists(fileSystem, directory) {
  try {
    return (await fileSystem.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function inspectPrivateFile({
  fileSystem,
  filePath,
  identity,
  existsKey,
  typeKey,
  ownerKey,
  modeKey,
  readableKey,
  value,
  statStage,
  permissionStage,
  readStage,
}) {
  let stat;
  try {
    stat = await fileSystem.lstat(filePath);
  } catch {
    return fail(value, statStage);
  }
  value[existsKey] = true;
  if (!stat.isFile()) return fail(value, statStage);
  value[typeKey] = true;
  value[ownerKey] = stat.uid === identity.uid && stat.gid === identity.gid;
  value[modeKey] = (stat.mode & 0o777) === PRIVATE_FILE_MODE;
  if (!privateRegularFile(stat, identity)) return fail(value, permissionStage);
  try {
    await fileSystem.access(filePath, constants.R_OK);
  } catch {
    return fail(value, readStage);
  }
  value[readableKey] = true;
  return null;
}

export async function diagnoseCredentialRecovery({
  keyMountPath,
  keyPath,
  credentialMountPath,
  credentialPath,
  bindings,
  runtimeIdentity = () => ({
    uid: process.geteuid?.(),
    gid: process.getegid?.(),
  }),
  fsApi = fs,
} = {}) {
  const value = blank();
  const identity = runtimeIdentity();
  if (!validIdentity(identity)) return fail(value, "runtime_identity");
  value.runtime_identity_valid = true;

  value.key_mount_exists = await directoryExists(fsApi, keyMountPath);
  if (!value.key_mount_exists) return fail(value, "key_mount");
  const keyFileFailure = await inspectPrivateFile({
    fileSystem: fsApi,
    filePath: keyPath,
    identity,
    value,
    existsKey: "key_file_exists",
    typeKey: "key_file_type_valid",
    ownerKey: "key_file_owner_valid",
    modeKey: "key_file_mode_valid",
    readableKey: "key_file_readable",
    statStage: "key_stat",
    permissionStage: "key_permissions",
    readStage: "key_read",
  });
  if (keyFileFailure) return keyFileFailure;

  value.credential_mount_exists = await directoryExists(
    fsApi,
    credentialMountPath,
  );
  if (!value.credential_mount_exists) return fail(value, "credential_mount");
  const credentialFileFailure = await inspectPrivateFile({
    fileSystem: fsApi,
    filePath: credentialPath,
    identity,
    value,
    existsKey: "credential_file_exists",
    typeKey: "credential_file_type_valid",
    ownerKey: "credential_file_owner_valid",
    modeKey: "credential_file_mode_valid",
    readableKey: "credential_file_readable",
    statStage: "credential_stat",
    permissionStage: "credential_permissions",
    readStage: "credential_read",
  });
  if (credentialFileFailure) return credentialFileFailure;

  let parsed;
  try {
    parsed = JSON.parse(await fsApi.readFile(credentialPath, "utf8"));
  } catch {
    return fail(value, "envelope_parse");
  }
  value.envelope_json_parse_succeeded = true;
  if (!validEnvelopeStructure(parsed)) return fail(value, "envelope_structure");
  value.envelope_structure_valid = true;

  let key;
  try {
    key = await readKeyFile(keyPath);
  } catch {
    return fail(value, "key_load");
  }
  value.key_load_succeeded = true;
  let envelope;
  try {
    envelope = await readEnvelope(credentialPath);
  } catch {
    return fail(value, "envelope_load");
  }
  value.envelope_load_succeeded = true;
  if (!bindingsMatch(envelope, bindings))
    return fail(value, "binding_validation");
  value.binding_validation_succeeded = true;
  try {
    decryptCredentialEnvelope(envelope, bindings, key);
  } catch {
    return fail(value, "credential_decryption");
  }
  value.credential_decryption_succeeded = true;
  value.failure_stage = "complete";
  value.safe_failure_category = "none";
  return value;
}
