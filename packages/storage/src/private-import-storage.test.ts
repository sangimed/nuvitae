import { constants } from "node:fs";
import { access, chmod, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  LocalPrivateImportStorage,
  PrivateImportStorageError,
  generatePrivateImportStorageKey,
  validatePrivateImportStorageKey,
} from "./private-import-storage.js";

const ownerUserId = "1ecf3f80-1038-4fe0-b50a-c47c78494a42";
const importId = "9bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e";
const secret = "synthetic-signing-secret-with-at-least-32-bytes";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("private import storage keys", () => {
  it("generates unique owner/import-scoped keys independent from filenames", () => {
    const first = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "source",
    });
    const second = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "source",
    });

    expect(first).toMatch(
      new RegExp(
        `^users/${ownerUserId}/imports/${importId}/source/[a-f0-9]{32}$`,
      ),
    );
    expect(first).not.toBe(second);
    expect(first).not.toContain("resume");
  });

  it.each([
    "../escape",
    "/absolute/path",
    "C:\\private\\file",
    `users\\${ownerUserId}\\imports\\${importId}\\source\\deadbeef`,
    "%2e%2e%2fescape",
    "users/%2e%2e/imports/value",
    `users/${ownerUserId}/imports/${importId}/source/../../escape`,
    `users/${ownerUserId}/imports/${importId}/source/value\u0000`,
  ])("rejects unsafe key %j", (key) => {
    expect(() => validatePrivateImportStorageKey(key)).toThrowError(
      expect.objectContaining({ code: "INVALID_STORAGE_KEY" }),
    );
  });
});

describe("Docker-volume-backed local private storage", () => {
  it("writes atomically, reads internally, exposes safe metadata, and uses restrictive permissions", async () => {
    const { storage, root } = await createStorage();
    const key = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "source",
    });
    const content = Buffer.from("synthetic fixture bytes");

    await storage.writeObject(key, content);

    expect(Buffer.from(await storage.readObject(key))).toEqual(content);
    expect(await storage.inspectObject(key)).toMatchObject({
      key,
      sizeBytes: content.byteLength,
    });
    const mode = (await stat(join(root, key))).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(await findTemporaryFiles(root)).toEqual([]);
  });

  it("deletes idempotently and distinguishes not-found reads", async () => {
    const { storage } = await createStorage();
    const key = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "artifact",
    });
    await storage.writeObject(key, Buffer.from("synthetic artifact"));

    expect(await storage.deleteObject(key)).toEqual({ deleted: true });
    expect(await storage.deleteObject(key)).toEqual({ deleted: false });
    await expect(storage.readObject(key)).rejects.toMatchObject({
      code: "STORAGE_OBJECT_NOT_FOUND",
    });
  });

  it("leaves no temporary file after a failed write", async () => {
    const { storage, root } = await createStorage();
    const key = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "parser-output",
    });
    await storage.writeObject(key, Buffer.from("existing object"));

    await expect(
      storage.writeObject(key, Buffer.from("replacement must fail")),
    ).rejects.toMatchObject({ code: "INTERNAL_STORAGE_FAILURE" });
    expect(await findTemporaryFiles(root)).toEqual([]);
    expect(Buffer.from(await storage.readObject(key)).toString()).toBe(
      "existing object",
    );

    const secondKey = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "parser-output",
    });
    await expect(
      storage.writeObject(secondKey, null as unknown as Uint8Array),
    ).rejects.toMatchObject({ code: "INTERNAL_STORAGE_FAILURE" });
    expect(await findTemporaryFiles(root)).toEqual([]);
  });

  it("issues and verifies short-lived operation/audience-bound internal references", async () => {
    const { storage } = await createStorage();
    const key = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "parser-input",
    });
    const now = new Date("2026-07-29T12:00:00.000Z");
    const reference = storage.issueSignedReference({
      key,
      operation: "read",
      audience: "import-worker",
      issuedAt: now,
      expiresAt: new Date("2026-07-29T12:01:00.000Z"),
    });

    expect(
      storage.verifySignedReference(reference, {
        operation: "read",
        audience: "import-worker",
        now,
      }),
    ).toEqual({
      key,
      operation: "read",
      audience: "import-worker",
      expiresAt: new Date("2026-07-29T12:01:00.000Z"),
    });

    const [payload, signature] = reference.split(".");
    const lastCharacter = signature?.at(-1);
    const tamperedSignature = `${signature?.slice(0, -1)}${
      lastCharacter === "A" ? "B" : "A"
    }`;
    const tampered = `${payload}.${tamperedSignature}`;
    expect(() =>
      storage.verifySignedReference(tampered, {
        operation: "read",
        audience: "import-worker",
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_SIGNED_REFERENCE" }),
    );
    expect(() =>
      storage.verifySignedReference(`${payload}.A`, {
        operation: "read",
        audience: "import-worker",
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_SIGNED_REFERENCE" }),
    );

    expect(() =>
      storage.verifySignedReference(reference, {
        operation: "delete",
        audience: "import-worker",
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SIGNED_REFERENCE_SCOPE_MISMATCH" }),
    );
    expect(() =>
      storage.verifySignedReference(reference, {
        operation: "read",
        audience: "api",
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SIGNED_REFERENCE_SCOPE_MISMATCH" }),
    );
    expect(() =>
      storage.verifySignedReference(reference, {
        operation: "read",
        audience: "import-worker",
        now: new Date("2026-07-29T12:01:00.000Z"),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SIGNED_REFERENCE_EXPIRED" }),
    );
  });

  it("does not expose filesystem paths or signing secrets in public errors", async () => {
    const { storage, root } = await createStorage();
    const key = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "source",
    });

    let error: unknown;
    try {
      await storage.readObject(key);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PrivateImportStorageError);
    const publicOutput = JSON.stringify(error);
    expect(publicOutput).not.toContain(root);
    expect(publicOutput).not.toContain(secret);
  });

  it("rejects a symlinked directory inside the storage root", async () => {
    const { storage, root } = await createStorage();
    const key = generatePrivateImportStorageKey({
      ownerUserId,
      importId,
      objectKind: "source",
    });
    const usersPath = join(root, "users");
    await rm(usersPath, { recursive: true, force: true });
    await chmod(root, 0o700);
    await access(root, constants.W_OK);
    const outside = await mkdtemp(join(tmpdir(), "nuvitae-storage-outside-"));
    roots.push(outside);
    const { symlink } = await import("node:fs/promises");
    await symlink(outside, usersPath);

    await expect(
      storage.writeObject(key, Buffer.from("must not escape")),
    ).rejects.toMatchObject({ code: "INTERNAL_STORAGE_FAILURE" });
    expect(await readdir(outside)).toEqual([]);
  });
});

async function createStorage() {
  const root = await mkdtemp(join(tmpdir(), "nuvitae-private-storage-"));
  roots.push(root);
  const storage = await LocalPrivateImportStorage.create({
    root,
    signingSecret: secret,
    maxSignedReferenceTtlSeconds: 300,
  });
  return { storage, root };
}

async function findTemporaryFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name.includes(".tmp-")) {
        found.push(path);
      }
    }
  }

  await visit(root);
  return found;
}
