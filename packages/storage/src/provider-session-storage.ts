import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessionReferencePattern = /^[a-f0-9]{64}$/;
const keyPattern =
  /^provider-sessions\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([a-f0-9]{64})$/;
const minimumEncryptionSecretBytes = 32;
const maximumSessionReferenceBytes = 128;
const envelopeVersion = 1;

export type ProviderSessionStorageErrorCode =
  | "INVALID_SESSION_REFERENCE"
  | "SESSION_OBJECT_NOT_FOUND"
  | "INVALID_SESSION_PAYLOAD"
  | "SESSION_PAYLOAD_TOO_LARGE"
  | "INTERNAL_SESSION_STORAGE_FAILURE";

export class ProviderSessionStorageError extends Error {
  constructor(readonly code: ProviderSessionStorageErrorCode) {
    super(publicMessageFor(code));
    this.name = "ProviderSessionStorageError";
  }
}

export interface ProviderSessionStorageConfig {
  readonly root: string;
  /**
   * Master secret for authenticated encryption. Supplied by the deployment
   * operator (Docker secret or environment secret) and never persisted in
   * image layers, logs, PostgreSQL, or Git.
   */
  readonly encryptionSecret: string | Uint8Array;
  readonly maxSessionBytes: number;
}

export interface ProviderSessionStorageInput {
  readonly ownerUserId: string;
  readonly connectionId: string;
  readonly sessionReference: string;
}

export interface ProviderSessionWriteInput extends ProviderSessionStorageInput {
  readonly payload: Uint8Array;
}

export interface ProviderSessionDeleteResult {
  readonly deleted: boolean;
}

/**
 * Provider-neutral encrypted session store used by future provider adapters.
 * Session material lives here, never in PostgreSQL and never under resume
 * source storage keys. Every stored payload is authenticated-encrypted with
 * the owner, connection, and opaque reference bound as associated data.
 */
export interface ProviderSessionStore {
  writeSession(
    input: ProviderSessionWriteInput,
  ): Promise<ProviderSessionStorageInput>;
  readSession(input: ProviderSessionStorageInput): Promise<Uint8Array>;
  deleteSession(
    input: ProviderSessionStorageInput,
  ): Promise<ProviderSessionDeleteResult>;
  hasSession(input: ProviderSessionStorageInput): Promise<boolean>;
}

export function generateProviderSessionStorageKey(
  input: ProviderSessionStorageInput,
): string {
  validateOwnerAndConnection(input.ownerUserId, input.connectionId);
  validateSessionReference(input.sessionReference);
  return [
    "provider-sessions",
    input.ownerUserId.toLowerCase(),
    input.connectionId.toLowerCase(),
    input.sessionReference.toLowerCase(),
  ].join("/");
}

export function validateProviderSessionStorageKey(
  candidate: string,
): ProviderSessionStorageInput {
  if (
    candidate.length > maximumSessionReferenceBytes + 256 ||
    candidate.includes("\\") ||
    candidate.includes("\0") ||
    candidate.includes("%") ||
    isAbsolute(candidate)
  ) {
    throw new ProviderSessionStorageError("INVALID_SESSION_REFERENCE");
  }

  const match = keyPattern.exec(candidate);
  const ownerUserId = match?.[1];
  const connectionId = match?.[2];
  const sessionReference = match?.[3];
  if (
    ownerUserId === undefined ||
    connectionId === undefined ||
    sessionReference === undefined ||
    !uuidPattern.test(ownerUserId) ||
    !uuidPattern.test(connectionId) ||
    !sessionReferencePattern.test(sessionReference)
  ) {
    throw new ProviderSessionStorageError("INVALID_SESSION_REFERENCE");
  }

  return Object.freeze({
    ownerUserId,
    connectionId,
    sessionReference,
  });
}

/**
 * Local encrypted provider-session storage for the Docker-managed volume. It
 * exposes no HTTP or static-file surface, never returns host filesystem paths,
 * and stores only authenticated-encrypted envelopes.
 */
export class LocalProviderSessionStorage implements ProviderSessionStore {
  private constructor(
    private readonly root: string,
    private readonly encryptionKey: Buffer,
    private readonly maxSessionBytes: number,
  ) {}

  static async create(
    config: ProviderSessionStorageConfig,
  ): Promise<LocalProviderSessionStorage> {
    const secret = Buffer.from(config.encryptionSecret);
    if (secret.byteLength < minimumEncryptionSecretBytes) {
      throw new ProviderSessionStorageError("INTERNAL_SESSION_STORAGE_FAILURE");
    }
    if (
      !Number.isSafeInteger(config.maxSessionBytes) ||
      config.maxSessionBytes <= 0 ||
      config.maxSessionBytes > 16 * 1024 * 1024
    ) {
      throw new ProviderSessionStorageError("INTERNAL_SESSION_STORAGE_FAILURE");
    }

    const configuredRoot = resolve(config.root);
    if (
      !isAbsolute(configuredRoot) ||
      configuredRoot === resolve(sep) ||
      configuredRoot.includes("\0")
    ) {
      throw new ProviderSessionStorageError("INTERNAL_SESSION_STORAGE_FAILURE");
    }

    try {
      await mkdir(configuredRoot, { recursive: true, mode: 0o700 });
      const rootStats = await lstat(configuredRoot);
      if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
        throw new ProviderSessionStorageError(
          "INTERNAL_SESSION_STORAGE_FAILURE",
        );
      }
      await chmod(configuredRoot, 0o700);
      const canonicalRoot = await realpath(configuredRoot);
      return new LocalProviderSessionStorage(
        canonicalRoot,
        deriveEncryptionKey(secret),
        config.maxSessionBytes,
      );
    } catch (error) {
      throw toStorageError(error, "INTERNAL_SESSION_STORAGE_FAILURE");
    }
  }

  async writeSession(
    input: ProviderSessionWriteInput,
  ): Promise<ProviderSessionStorageInput> {
    validateOwnerAndConnection(input.ownerUserId, input.connectionId);
    validateSessionReference(input.sessionReference);
    if (input.payload.byteLength > this.maxSessionBytes) {
      throw new ProviderSessionStorageError("SESSION_PAYLOAD_TOO_LARGE");
    }
    if (input.payload.byteLength === 0) {
      throw new ProviderSessionStorageError("INVALID_SESSION_PAYLOAD");
    }

    const destination = this.resolveConfinedPath(
      generateProviderSessionStorageKey(input),
    );
    const parent = dirname(destination);
    const temporaryPath = join(
      parent,
      `.tmp-${randomBytes(16).toString("hex")}`,
    );
    let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      await this.ensureSafeDirectory(parent);
      if (await pathExists(destination)) {
        throw new ProviderSessionStorageError(
          "INTERNAL_SESSION_STORAGE_FAILURE",
        );
      }

      temporaryHandle = await open(
        temporaryPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          noFollowFlag(),
        0o600,
      );
      const envelope = encryptEnvelope(input, this.encryptionKey);
      await temporaryHandle.writeFile(
        Buffer.from(JSON.stringify(envelope), "utf8"),
      );
      await temporaryHandle.sync();
      await temporaryHandle.close();
      temporaryHandle = undefined;
      await chmod(temporaryPath, 0o600);

      if (await pathExists(destination)) {
        throw new ProviderSessionStorageError(
          "INTERNAL_SESSION_STORAGE_FAILURE",
        );
      }
      await rename(temporaryPath, destination);
    } catch (error) {
      throw toStorageError(error, "INTERNAL_SESSION_STORAGE_FAILURE");
    } finally {
      if (temporaryHandle !== undefined) {
        await temporaryHandle.close().catch(() => undefined);
      }
      await unlink(temporaryPath).catch(() => undefined);
    }

    return Object.freeze({
      ownerUserId: input.ownerUserId,
      connectionId: input.connectionId,
      sessionReference: input.sessionReference,
    });
  }

  async readSession(input: ProviderSessionStorageInput): Promise<Uint8Array> {
    const path = this.resolveConfinedPath(
      generateProviderSessionStorageKey(input),
    );
    let content: Uint8Array;
    try {
      await this.ensureExistingPathIsSafe(path);
      const handle = await open(path, constants.O_RDONLY | noFollowFlag());
      try {
        const fileStats = await handle.stat();
        if (!fileStats.isFile()) {
          throw new ProviderSessionStorageError("SESSION_OBJECT_NOT_FOUND");
        }
        if (fileStats.size > maximumEnvelopeBytes(this.maxSessionBytes)) {
          throw new ProviderSessionStorageError("INVALID_SESSION_PAYLOAD");
        }
        content = await handle.readFile();
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw toStorageError(
        error,
        isNotFoundError(error)
          ? "SESSION_OBJECT_NOT_FOUND"
          : "INTERNAL_SESSION_STORAGE_FAILURE",
      );
    }

    try {
      return decryptEnvelope(
        content,
        input,
        this.encryptionKey,
        this.maxSessionBytes,
      );
    } catch (error) {
      if (error instanceof ProviderSessionStorageError) throw error;
      throw new ProviderSessionStorageError("INVALID_SESSION_PAYLOAD");
    }
  }

  async deleteSession(
    input: ProviderSessionStorageInput,
  ): Promise<ProviderSessionDeleteResult> {
    const path = this.resolveConfinedPath(
      generateProviderSessionStorageKey(input),
    );
    try {
      await this.ensureExistingPathIsSafe(path);
      await unlink(path);
      return { deleted: true };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { deleted: false };
      }
      throw toStorageError(error, "INTERNAL_SESSION_STORAGE_FAILURE");
    }
  }

  async hasSession(input: ProviderSessionStorageInput): Promise<boolean> {
    const path = this.resolveConfinedPath(
      generateProviderSessionStorageKey(input),
    );
    try {
      await this.ensureExistingPathIsSafe(path);
      const fileStats = await lstat(path);
      return fileStats.isFile();
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw toStorageError(error, "INTERNAL_SESSION_STORAGE_FAILURE");
    }
  }

  private resolveConfinedPath(key: string): string {
    validateProviderSessionStorageKey(key);
    const path = resolve(this.root, key);
    const pathRelativeToRoot = relative(this.root, path);
    if (
      pathRelativeToRoot === "" ||
      pathRelativeToRoot === ".." ||
      pathRelativeToRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathRelativeToRoot)
    ) {
      throw new ProviderSessionStorageError("INVALID_SESSION_REFERENCE");
    }
    return path;
  }

  private async ensureSafeDirectory(directory: string): Promise<void> {
    const relativeDirectory = relative(this.root, directory);
    let current = this.root;
    for (const segment of relativeDirectory.split(sep).filter(Boolean)) {
      current = join(current, segment);
      try {
        const currentStats = await lstat(current);
        if (!currentStats.isDirectory() || currentStats.isSymbolicLink()) {
          throw new ProviderSessionStorageError(
            "INTERNAL_SESSION_STORAGE_FAILURE",
          );
        }
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (mkdirError) {
          if (!isAlreadyExistsError(mkdirError)) {
            throw mkdirError;
          }
          const currentStats = await lstat(current);
          if (!currentStats.isDirectory() || currentStats.isSymbolicLink()) {
            throw new ProviderSessionStorageError(
              "INTERNAL_SESSION_STORAGE_FAILURE",
            );
          }
        }
      }
    }
  }

  private async ensureExistingPathIsSafe(path: string): Promise<void> {
    const relativePath = relative(this.root, path);
    let current = this.root;
    for (const segment of relativePath.split(sep).filter(Boolean)) {
      current = join(current, segment);
      const currentStats = await lstat(current);
      if (currentStats.isSymbolicLink()) {
        throw new ProviderSessionStorageError(
          "INTERNAL_SESSION_STORAGE_FAILURE",
        );
      }
    }
  }
}

interface ProviderSessionEnvelope {
  readonly v: 1;
  readonly keyVersion: 1;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly tag: string;
}

function encryptEnvelope(
  input: ProviderSessionWriteInput,
  key: Buffer,
): ProviderSessionEnvelope {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associatedData(input));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(input.payload)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    v: envelopeVersion,
    keyVersion: 1,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: tag.toString("base64url"),
  };
}

function decryptEnvelope(
  content: Uint8Array,
  input: ProviderSessionStorageInput,
  key: Buffer,
  maxSessionBytes: number,
): Uint8Array {
  const envelope = parseEnvelope(content);
  const nonce = Buffer.from(envelope.nonce, "base64url");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
  const tag = Buffer.from(envelope.tag, "base64url");
  if (
    nonce.byteLength !== 12 ||
    tag.byteLength !== 16 ||
    ciphertext.byteLength === 0 ||
    ciphertext.byteLength > maxSessionBytes
  ) {
    throw new ProviderSessionStorageError("INVALID_SESSION_PAYLOAD");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(associatedData(input));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new ProviderSessionStorageError("INVALID_SESSION_PAYLOAD");
  }
}

function parseEnvelope(content: Uint8Array): ProviderSessionEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(content).toString("utf8"));
  } catch {
    throw new ProviderSessionStorageError("INVALID_SESSION_PAYLOAD");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProviderSessionStorageError("INVALID_SESSION_PAYLOAD");
  }
  const candidate = parsed as Record<string, unknown>;
  if (
    candidate.v !== 1 ||
    candidate.keyVersion !== 1 ||
    typeof candidate.nonce !== "string" ||
    typeof candidate.ciphertext !== "string" ||
    typeof candidate.tag !== "string" ||
    candidate.nonce === "" ||
    candidate.ciphertext === "" ||
    candidate.tag === ""
  ) {
    throw new ProviderSessionStorageError("INVALID_SESSION_PAYLOAD");
  }
  return {
    v: 1,
    keyVersion: 1,
    nonce: candidate.nonce,
    ciphertext: candidate.ciphertext,
    tag: candidate.tag,
  };
}

function associatedData(input: ProviderSessionStorageInput): Buffer {
  return Buffer.from(
    [
      "provider-session",
      "v1",
      input.ownerUserId.toLowerCase(),
      input.connectionId.toLowerCase(),
      input.sessionReference.toLowerCase(),
    ].join("|"),
    "utf8",
  );
}

function deriveEncryptionKey(secret: Buffer): Buffer {
  return createHash("sha256").update(secret).digest();
}

function maximumEnvelopeBytes(maxSessionBytes: number): number {
  return maxSessionBytes * 2 + 512;
}

function validateOwnerAndConnection(
  ownerUserId: string,
  connectionId: string,
): void {
  if (!uuidPattern.test(ownerUserId) || !uuidPattern.test(connectionId)) {
    throw new ProviderSessionStorageError("INVALID_SESSION_REFERENCE");
  }
}

function validateSessionReference(sessionReference: string): void {
  if (
    !sessionReferencePattern.test(sessionReference) ||
    sessionReference.length > maximumSessionReferenceBytes
  ) {
    throw new ProviderSessionStorageError("INVALID_SESSION_REFERENCE");
  }
}

function noFollowFlag(): number {
  return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isNotFoundError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

function isAlreadyExistsError(error: unknown): boolean {
  return isNodeError(error) && error.code === "EEXIST";
}

function toStorageError(
  error: unknown,
  fallbackCode: ProviderSessionStorageErrorCode,
): ProviderSessionStorageError {
  return error instanceof ProviderSessionStorageError
    ? error
    : new ProviderSessionStorageError(fallbackCode);
}

function publicMessageFor(code: ProviderSessionStorageErrorCode): string {
  switch (code) {
    case "INVALID_SESSION_REFERENCE":
      return "The provider session reference is invalid.";
    case "SESSION_OBJECT_NOT_FOUND":
      return "The provider session was not found.";
    case "INVALID_SESSION_PAYLOAD":
      return "The provider session payload is invalid.";
    case "SESSION_PAYLOAD_TOO_LARGE":
      return "The provider session payload is too large.";
    case "INTERNAL_SESSION_STORAGE_FAILURE":
      return "Provider session storage is unavailable.";
  }
}
