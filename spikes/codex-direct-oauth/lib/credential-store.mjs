import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const ENVELOPE_VERSION = 1;
export const KEY_VERSION = 1;
const ALGORITHM = "aes-256-gcm";

function aadFor({ ownerNamespace, connectionId, provider }) {
  return Buffer.from(JSON.stringify({ ownerNamespace, connectionId, provider }), "utf8");
}

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("invalid_master_key");
}

function assertBindings(bindings) {
  for (const field of ["ownerNamespace", "connectionId", "provider"]) {
    if (typeof bindings?.[field] !== "string" || bindings[field].length === 0) {
      throw new Error("invalid_credential_binding");
    }
  }
}

export function createMasterKey() {
  return crypto.randomBytes(32);
}

export function encryptCredentialEnvelope(payload, bindings, key, previousGeneration = 0) {
  assertKey(key);
  assertBindings(bindings);
  const now = new Date().toISOString();
  const generation = previousGeneration + 1;
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(aadFor(bindings));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    envelope_version: ENVELOPE_VERSION,
    key_version: KEY_VERSION,
    algorithm: ALGORITHM,
    owner_binding: bindings.ownerNamespace,
    connection_binding: bindings.connectionId,
    provider_binding: bindings.provider,
    created_at: now,
    updated_at: now,
    credential_generation: generation,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authentication_tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptCredentialEnvelope(envelope, bindings, key) {
  assertKey(key);
  assertBindings(bindings);
  if (!envelope || envelope.envelope_version !== ENVELOPE_VERSION) throw new Error("unsupported_envelope_version");
  if (envelope.key_version !== KEY_VERSION) throw new Error("unsupported_key_version");
  if (envelope.algorithm !== ALGORITHM) throw new Error("unsupported_encryption_algorithm");
  if (envelope.owner_binding !== bindings.ownerNamespace) throw new Error("owner_binding_mismatch");
  if (envelope.connection_binding !== bindings.connectionId) throw new Error("connection_binding_mismatch");
  if (envelope.provider_binding !== bindings.provider) throw new Error("provider_binding_mismatch");
  let nonce;
  let ciphertext;
  let tag;
  try {
    nonce = Buffer.from(envelope.nonce, "base64url");
    ciphertext = Buffer.from(envelope.ciphertext, "base64url");
    tag = Buffer.from(envelope.authentication_tag, "base64url");
  } catch (_error) {
    throw new Error("malformed_ciphertext");
  }
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("malformed_ciphertext");
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAAD(aadFor(bindings));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return { payload: JSON.parse(plaintext.toString("utf8")), generation: envelope.credential_generation };
  } catch (_error) {
    throw new Error("credential_authentication_failed");
  }
}

export async function writeKeyFile(filePath, key) {
  assertKey(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.chmod(path.dirname(filePath), 0o700);
  await fs.writeFile(filePath, key, { mode: 0o600, flag: "wx" });
  await fs.chmod(filePath, 0o600);
}

export async function readKeyFile(filePath) {
  const key = await fs.readFile(filePath);
  assertKey(key);
  return key;
}

export async function atomicWriteEnvelope(filePath, envelope, expectedGeneration) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  let current;
  try { current = JSON.parse(await fs.readFile(filePath, "utf8")); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current && expectedGeneration !== undefined && current.credential_generation !== expectedGeneration) {
    throw new Error("credential_generation_conflict");
  }
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(envelope)}\n`, "utf8");
    await handle.sync();
  } finally { await handle.close(); }
  await fs.rename(temporary, filePath);
  try { const directory = await fs.open(path.dirname(filePath), "r"); await directory.sync(); await directory.close(); } catch (_error) { /* unsupported on some filesystems */ }
}

export async function removeCredentialRecord(filePath) {
  const directory = path.dirname(filePath);
  const entries = await fs.readdir(directory).catch(() => []);
  await Promise.all(entries.filter((entry) => entry === path.basename(filePath) || entry.startsWith(`${path.basename(filePath)}.tmp-`) || entry === `${path.basename(filePath)}.bak`).map((entry) => fs.rm(path.join(directory, entry), { force: true })));
}

export async function readEnvelope(filePath) { return JSON.parse(await fs.readFile(filePath, "utf8")); }
