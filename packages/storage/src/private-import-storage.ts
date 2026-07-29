import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern =
  /^users\/([0-9a-f-]{36})\/imports\/([0-9a-f-]{36})\/(source|artifact|parser-input|parser-output)\/([a-f0-9]{32})$/;
const audiencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const minimumSigningSecretBytes = 32;
const maximumConfigurableSignedReferenceTtlSeconds = 60 * 60;

export type PrivateImportObjectKind =
  "source" | "artifact" | "parser-input" | "parser-output";
export type SignedStorageOperation = "read" | "write" | "delete" | "inspect";

export interface GeneratePrivateImportStorageKeyInput {
  readonly ownerUserId: string;
  readonly importId: string;
  readonly objectKind: PrivateImportObjectKind;
}

export interface ValidatedPrivateImportStorageKey {
  readonly key: string;
  readonly ownerUserId: string;
  readonly importId: string;
  readonly objectKind: PrivateImportObjectKind;
  readonly objectId: string;
}

export type PrivateImportStorageErrorCode =
  | "INVALID_STORAGE_KEY"
  | "STORAGE_OBJECT_NOT_FOUND"
  | "INVALID_SIGNED_REFERENCE"
  | "SIGNED_REFERENCE_EXPIRED"
  | "SIGNED_REFERENCE_SCOPE_MISMATCH"
  | "INTERNAL_STORAGE_FAILURE";

export class PrivateImportStorageError extends Error {
  constructor(readonly code: PrivateImportStorageErrorCode) {
    super(publicMessageFor(code));
    this.name = "PrivateImportStorageError";
  }
}

export interface PrivateImportStorageConfig {
  readonly root: string;
  readonly signingSecret: string | Uint8Array;
  readonly maxSignedReferenceTtlSeconds: number;
}

export interface PrivateImportObjectMetadata {
  readonly key: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
  readonly modifiedAt: Date;
}

export interface IssueSignedStorageReferenceInput {
  readonly key: string;
  readonly operation: SignedStorageOperation;
  readonly audience: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface VerifySignedStorageReferenceInput {
  readonly operation: SignedStorageOperation;
  readonly audience: string;
  readonly now: Date;
}

export interface VerifiedSignedStorageReference {
  readonly key: string;
  readonly operation: SignedStorageOperation;
  readonly audience: string;
  readonly expiresAt: Date;
}

interface SignedReferencePayload {
  readonly v: 1;
  readonly k: string;
  readonly exp: number;
  readonly op: SignedStorageOperation;
  readonly aud: string;
}

export function generatePrivateImportStorageKey(
  input: GeneratePrivateImportStorageKeyInput,
): string {
  if (
    !uuidPattern.test(input.ownerUserId) ||
    !uuidPattern.test(input.importId)
  ) {
    throw new PrivateImportStorageError("INVALID_STORAGE_KEY");
  }
  return [
    "users",
    input.ownerUserId.toLowerCase(),
    "imports",
    input.importId.toLowerCase(),
    input.objectKind,
    randomBytes(16).toString("hex"),
  ].join("/");
}

export function validatePrivateImportStorageKey(
  candidate: string,
): ValidatedPrivateImportStorageKey {
  if (
    candidate.length > 256 ||
    candidate.includes("\\") ||
    candidate.includes("\0") ||
    candidate.includes("%") ||
    isAbsolute(candidate)
  ) {
    throw new PrivateImportStorageError("INVALID_STORAGE_KEY");
  }

  const match = keyPattern.exec(candidate);
  const ownerUserId = match?.[1];
  const importId = match?.[2];
  const objectKind = match?.[3] as PrivateImportObjectKind | undefined;
  const objectId = match?.[4];
  if (
    ownerUserId === undefined ||
    importId === undefined ||
    objectKind === undefined ||
    objectId === undefined ||
    !uuidPattern.test(ownerUserId) ||
    !uuidPattern.test(importId)
  ) {
    throw new PrivateImportStorageError("INVALID_STORAGE_KEY");
  }

  return Object.freeze({
    key: candidate,
    ownerUserId,
    importId,
    objectKind,
    objectId,
  });
}

/**
 * Local private storage for the Docker-managed volume. It exposes no HTTP or
 * static-file surface and never returns a host filesystem path.
 */
export class LocalPrivateImportStorage {
  private constructor(
    private readonly root: string,
    private readonly signingSecret: Buffer,
    private readonly maxSignedReferenceTtlSeconds: number,
  ) {}

  static async create(
    config: PrivateImportStorageConfig,
  ): Promise<LocalPrivateImportStorage> {
    const secret = Buffer.from(config.signingSecret);
    if (secret.byteLength < minimumSigningSecretBytes) {
      throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
    }
    if (
      !Number.isInteger(config.maxSignedReferenceTtlSeconds) ||
      config.maxSignedReferenceTtlSeconds <= 0 ||
      config.maxSignedReferenceTtlSeconds >
        maximumConfigurableSignedReferenceTtlSeconds
    ) {
      throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
    }

    const configuredRoot = resolve(config.root);
    if (
      !isAbsolute(configuredRoot) ||
      configuredRoot === resolve(sep) ||
      configuredRoot.includes("\0")
    ) {
      throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
    }

    try {
      await mkdir(configuredRoot, { recursive: true, mode: 0o700 });
      const rootStats = await lstat(configuredRoot);
      if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
        throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
      }
      await chmod(configuredRoot, 0o700);
      const canonicalRoot = await realpath(configuredRoot);
      return new LocalPrivateImportStorage(
        canonicalRoot,
        secret,
        config.maxSignedReferenceTtlSeconds,
      );
    } catch (error) {
      throw toStorageError(error, "INTERNAL_STORAGE_FAILURE");
    }
  }

  async writeObject(key: string, content: Uint8Array): Promise<void> {
    const destination = this.resolveConfinedPath(key);
    const parent = dirname(destination);
    const temporaryPath = join(
      parent,
      `.tmp-${randomBytes(16).toString("hex")}`,
    );
    let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      await this.ensureSafeDirectory(parent);
      if (await pathExists(destination)) {
        throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
      }

      temporaryHandle = await open(
        temporaryPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          noFollowFlag(),
        0o600,
      );
      await temporaryHandle.writeFile(content);
      await temporaryHandle.sync();
      await temporaryHandle.close();
      temporaryHandle = undefined;
      await chmod(temporaryPath, 0o600);

      // Check again immediately before the atomic same-directory rename. Keys
      // are generated with 128 random bits and writes never intentionally
      // replace an existing private object.
      if (await pathExists(destination)) {
        throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
      }
      await rename(temporaryPath, destination);
    } catch (error) {
      throw toStorageError(error, "INTERNAL_STORAGE_FAILURE");
    } finally {
      if (temporaryHandle !== undefined) {
        await temporaryHandle.close().catch(() => undefined);
      }
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  async readObject(key: string): Promise<Uint8Array> {
    const path = this.resolveConfinedPath(key);
    try {
      await this.ensureExistingPathIsSafe(path);
      const handle = await open(path, constants.O_RDONLY | noFollowFlag());
      try {
        const fileStats = await handle.stat();
        if (!fileStats.isFile()) {
          throw new PrivateImportStorageError("STORAGE_OBJECT_NOT_FOUND");
        }
        return await handle.readFile();
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw toStorageError(
        error,
        isNotFoundError(error)
          ? "STORAGE_OBJECT_NOT_FOUND"
          : "INTERNAL_STORAGE_FAILURE",
      );
    }
  }

  async inspectObject(key: string): Promise<PrivateImportObjectMetadata> {
    const path = this.resolveConfinedPath(key);
    try {
      await this.ensureExistingPathIsSafe(path);
      const fileStats = await stat(path);
      if (!fileStats.isFile()) {
        throw new PrivateImportStorageError("STORAGE_OBJECT_NOT_FOUND");
      }
      return Object.freeze({
        key,
        sizeBytes: fileStats.size,
        createdAt: fileStats.birthtime,
        modifiedAt: fileStats.mtime,
      });
    } catch (error) {
      throw toStorageError(
        error,
        isNotFoundError(error)
          ? "STORAGE_OBJECT_NOT_FOUND"
          : "INTERNAL_STORAGE_FAILURE",
      );
    }
  }

  async deleteObject(key: string): Promise<{ readonly deleted: boolean }> {
    const path = this.resolveConfinedPath(key);
    try {
      await this.ensureExistingPathIsSafe(path);
      await unlink(path);
      return { deleted: true };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { deleted: false };
      }
      throw toStorageError(error, "INTERNAL_STORAGE_FAILURE");
    }
  }

  issueSignedReference(input: IssueSignedStorageReferenceInput): string {
    validatePrivateImportStorageKey(input.key);
    validateAudience(input.audience);
    const issuedAtMilliseconds = input.issuedAt.getTime();
    const expiryMilliseconds = input.expiresAt.getTime();
    if (
      !Number.isFinite(issuedAtMilliseconds) ||
      !Number.isFinite(expiryMilliseconds) ||
      expiryMilliseconds <= issuedAtMilliseconds ||
      expiryMilliseconds - issuedAtMilliseconds >
        this.maxSignedReferenceTtlSeconds * 1_000
    ) {
      throw new PrivateImportStorageError("INVALID_SIGNED_REFERENCE");
    }

    const payload: SignedReferencePayload = {
      v: 1,
      k: input.key,
      exp: Math.floor(expiryMilliseconds / 1_000),
      op: input.operation,
      aud: input.audience,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signature = this.sign(encodedPayload).toString("base64url");
    return `${encodedPayload}.${signature}`;
  }

  verifySignedReference(
    reference: string,
    expected: VerifySignedStorageReferenceInput,
  ): VerifiedSignedStorageReference {
    validateAudience(expected.audience);
    if (!Number.isFinite(expected.now.getTime())) {
      throw new PrivateImportStorageError("INVALID_SIGNED_REFERENCE");
    }

    const parts = reference.split(".");
    const encodedPayload = parts[0];
    const encodedSignature = parts[1];
    if (
      parts.length !== 2 ||
      encodedPayload === undefined ||
      encodedSignature === undefined ||
      encodedPayload.length === 0 ||
      encodedSignature.length === 0
    ) {
      throw new PrivateImportStorageError("INVALID_SIGNED_REFERENCE");
    }

    const expectedSignature = this.sign(encodedPayload);
    let suppliedSignature: Buffer;
    try {
      suppliedSignature = Buffer.from(encodedSignature, "base64url");
    } catch {
      suppliedSignature = Buffer.alloc(0);
    }

    // Always execute timingSafeEqual with equal-length buffers. Invalid-length
    // signatures compare against a fixed-size zero buffer and are rejected
    // after the comparison.
    const comparableSignature =
      suppliedSignature.byteLength === expectedSignature.byteLength
        ? suppliedSignature
        : Buffer.alloc(expectedSignature.byteLength);
    const signatureMatches = timingSafeEqual(
      expectedSignature,
      comparableSignature,
    );
    if (
      !signatureMatches ||
      suppliedSignature.byteLength !== expectedSignature.byteLength
    ) {
      throw new PrivateImportStorageError("INVALID_SIGNED_REFERENCE");
    }

    const payload = parseSignedPayload(encodedPayload);
    validatePrivateImportStorageKey(payload.k);
    if (expected.now.getTime() >= payload.exp * 1_000) {
      throw new PrivateImportStorageError("SIGNED_REFERENCE_EXPIRED");
    }
    if (
      payload.op !== expected.operation ||
      payload.aud !== expected.audience
    ) {
      throw new PrivateImportStorageError("SIGNED_REFERENCE_SCOPE_MISMATCH");
    }

    return Object.freeze({
      key: payload.k,
      operation: payload.op,
      audience: payload.aud,
      expiresAt: new Date(payload.exp * 1_000),
    });
  }

  private resolveConfinedPath(key: string): string {
    validatePrivateImportStorageKey(key);
    const path = resolve(this.root, key);
    const pathRelativeToRoot = relative(this.root, path);
    if (
      pathRelativeToRoot === "" ||
      pathRelativeToRoot === ".." ||
      pathRelativeToRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathRelativeToRoot)
    ) {
      throw new PrivateImportStorageError("INVALID_STORAGE_KEY");
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
          throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
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
            throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
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
        throw new PrivateImportStorageError("INTERNAL_STORAGE_FAILURE");
      }
    }
  }

  private sign(encodedPayload: string): Buffer {
    return createHmac("sha256", this.signingSecret)
      .update(encodedPayload, "utf8")
      .digest();
  }
}

function parseSignedPayload(encodedPayload: string): SignedReferencePayload {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("invalid");
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.v !== 1 ||
      typeof candidate.k !== "string" ||
      typeof candidate.exp !== "number" ||
      !Number.isSafeInteger(candidate.exp) ||
      typeof candidate.op !== "string" ||
      !isSignedOperation(candidate.op) ||
      typeof candidate.aud !== "string" ||
      Object.keys(candidate).length !== 5
    ) {
      throw new Error("invalid");
    }
    validateAudience(candidate.aud);
    return {
      v: 1,
      k: candidate.k,
      exp: candidate.exp,
      op: candidate.op,
      aud: candidate.aud,
    };
  } catch {
    throw new PrivateImportStorageError("INVALID_SIGNED_REFERENCE");
  }
}

function validateAudience(audience: string): void {
  if (!audiencePattern.test(audience)) {
    throw new PrivateImportStorageError("INVALID_SIGNED_REFERENCE");
  }
}

function isSignedOperation(value: string): value is SignedStorageOperation {
  return ["read", "write", "delete", "inspect"].includes(value);
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
  fallbackCode: PrivateImportStorageErrorCode,
): PrivateImportStorageError {
  return error instanceof PrivateImportStorageError
    ? error
    : new PrivateImportStorageError(fallbackCode);
}

function publicMessageFor(code: PrivateImportStorageErrorCode): string {
  switch (code) {
    case "INVALID_STORAGE_KEY":
      return "The private storage key is invalid.";
    case "STORAGE_OBJECT_NOT_FOUND":
      return "The private storage object was not found.";
    case "INVALID_SIGNED_REFERENCE":
      return "The internal storage reference is invalid.";
    case "SIGNED_REFERENCE_EXPIRED":
      return "The internal storage reference has expired.";
    case "SIGNED_REFERENCE_SCOPE_MISMATCH":
      return "The internal storage reference cannot be used for this operation.";
    case "INTERNAL_STORAGE_FAILURE":
      return "Private storage is unavailable.";
  }
}
