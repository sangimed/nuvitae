import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  LocalProviderSessionStorage,
  generateProviderSessionStorageKey,
  validateProviderSessionStorageKey,
} from "./provider-session-storage.js";

const ownerUserId = "1ecf3f80-1038-4fe0-b50a-c47c78494a42";
const otherOwnerUserId = "2ecf3f80-1038-4fe0-b50a-c47c78494a42";
const connectionId = "9bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e";
const otherConnectionId = "8bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e";
const sessionReference = "a".repeat(64);
const secret = "synthetic-session-encryption-secret-with-32-bytes-min";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function createStorage(
  options: { readonly maxSessionBytes?: number } = {},
): Promise<{
  readonly storage: LocalProviderSessionStorage;
  readonly root: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "nuvitae-sessions-"));
  roots.push(root);
  const storage = await LocalProviderSessionStorage.create({
    root,
    encryptionSecret: secret,
    maxSessionBytes: options.maxSessionBytes ?? 4096,
  });
  return { storage, root };
}

describe("provider session storage keys", () => {
  it("generates opaque owner/connection-scoped keys with a 64-hex reference", () => {
    const key = generateProviderSessionStorageKey({
      ownerUserId,
      connectionId,
      sessionReference,
    });
    expect(key).toBe(
      `provider-sessions/${ownerUserId}/${connectionId}/${sessionReference}`,
    );
    expect(key).not.toContain("imports");
    expect(key).not.toContain("resume");
  });

  it.each([
    "../escape",
    "/absolute/path",
    "C:\\private\\file",
    `provider-sessions\\${ownerUserId}\\${connectionId}\\${sessionReference}`,
    `provider-sessions/${ownerUserId}/${connectionId}/${"z".repeat(64)}`,
    `provider-sessions/${ownerUserId}/${connectionId}/abc`,
    `provider-sessions/${ownerUserId}/not-a-uuid/${sessionReference}`,
    "users/1ecf3f80-1038-4fe0-b50a-c47c78494a42/imports/9bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e/source/00000000000000000000000000000000",
    `provider-sessions/${ownerUserId}/${connectionId}/${sessionReference}\u0000`,
  ])("rejects unsafe or forged session references %j", (key) => {
    expect(() => validateProviderSessionStorageKey(key)).toThrowError(
      expect.objectContaining({ code: "INVALID_SESSION_REFERENCE" }),
    );
  });
});

describe("encrypted provider session storage", () => {
  it("writes encrypted sessions atomically with restrictive permissions", async () => {
    const { storage, root } = await createStorage();
    const payload = Buffer.from("opaque broker session material");

    const result = await storage.writeSession({
      ownerUserId,
      connectionId,
      sessionReference,
      payload,
    });
    expect(result.sessionReference).toBe(sessionReference);
    expect(
      Buffer.from(
        await storage.readSession({
          ownerUserId,
          connectionId,
          sessionReference,
        }),
      ),
    ).toEqual(payload);
    expect(
      await storage.hasSession({
        ownerUserId,
        connectionId,
        sessionReference,
      }),
    ).toBe(true);

    const key = generateProviderSessionStorageKey({
      ownerUserId,
      connectionId,
      sessionReference,
    });
    const stored = await readFile(join(root, key), "utf8");
    expect(stored).not.toContain("opaque broker session material");
    expect(stored).not.toContain(payload.toString("base64"));
    expect(stored).toContain('"v":1');

    const fileMode = (await stat(join(root, key))).mode & 0o777;
    expect(fileMode).toBe(0o600);
    const parentMode =
      (await stat(join(root, "provider-sessions"))).mode & 0o777;
    expect(parentMode).toBe(0o700);
    expect(await readdir(join(root, "provider-sessions"))).not.toContain(
      ".tmp-",
    );
  });

  it("rejects overwrite attempts for an existing session reference", async () => {
    const { storage } = await createStorage();
    const payload = Buffer.from("first session");
    await storage.writeSession({
      ownerUserId,
      connectionId,
      sessionReference,
      payload,
    });
    await expect(
      storage.writeSession({
        ownerUserId,
        connectionId,
        sessionReference,
        payload: Buffer.from("second session"),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INTERNAL_SESSION_STORAGE_FAILURE" }),
    );
  });

  it("isolates sessions across owners, connections, and references", async () => {
    const { storage } = await createStorage();
    await storage.writeSession({
      ownerUserId,
      connectionId,
      sessionReference,
      payload: Buffer.from("owner A session"),
    });

    await expect(
      storage.readSession({
        ownerUserId: otherOwnerUserId,
        connectionId,
        sessionReference,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "SESSION_OBJECT_NOT_FOUND" }),
    );
    await expect(
      storage.readSession({
        ownerUserId,
        connectionId: otherConnectionId,
        sessionReference,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "SESSION_OBJECT_NOT_FOUND" }),
    );
    expect(
      await storage.deleteSession({
        ownerUserId: otherOwnerUserId,
        connectionId,
        sessionReference,
      }),
    ).toEqual({ deleted: false });
    expect(
      await storage.hasSession({
        ownerUserId,
        connectionId,
        sessionReference,
      }),
    ).toBe(true);
  });

  it("detects tampering and rejects decryption with a different key", async () => {
    const { storage, root } = await createStorage();
    await storage.writeSession({
      ownerUserId,
      connectionId,
      sessionReference,
      payload: Buffer.from("integrity-protected session"),
    });
    const key = generateProviderSessionStorageKey({
      ownerUserId,
      connectionId,
      sessionReference,
    });
    const path = join(root, key);
    await chmod(path, 0o600);
    await writeFile(
      path,
      JSON.stringify({
        ...JSON.parse(await readFile(path, "utf8")),
        ciphertext: "dGFtcGVyZWQ=",
      }),
    );
    await expect(
      storage.readSession({
        ownerUserId,
        connectionId,
        sessionReference,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INVALID_SESSION_PAYLOAD" }),
    );

    const otherRoot = await mkdtemp(join(tmpdir(), "nuvitae-sessions-other-"));
    roots.push(otherRoot);
    const otherStorage = await LocalProviderSessionStorage.create({
      root: otherRoot,
      encryptionSecret: "a-different-synthetic-secret-with-32-bytes-minimum",
      maxSessionBytes: 4096,
    });
    await otherStorage.writeSession({
      ownerUserId,
      connectionId,
      sessionReference,
      payload: Buffer.from("other key session"),
    });
    await expect(
      storage.readSession({
        ownerUserId,
        connectionId,
        sessionReference,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INVALID_SESSION_PAYLOAD" }),
    );
  });

  it("enforces the configured payload limit and empty payload rejection", async () => {
    const { storage } = await createStorage({ maxSessionBytes: 16 });
    await expect(
      storage.writeSession({
        ownerUserId,
        connectionId,
        sessionReference,
        payload: Buffer.from("this payload exceeds the sixteen byte cap!"),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "SESSION_PAYLOAD_TOO_LARGE" }),
    );
    await expect(
      storage.writeSession({
        ownerUserId,
        connectionId,
        sessionReference,
        payload: Buffer.alloc(0),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INVALID_SESSION_PAYLOAD" }),
    );
  });

  it("deletes sessions idempotently and never leaves partial temp files", async () => {
    const { storage, root } = await createStorage();
    await storage.writeSession({
      ownerUserId,
      connectionId,
      sessionReference,
      payload: Buffer.from("revocable session"),
    });
    expect(
      await storage.deleteSession({
        ownerUserId,
        connectionId,
        sessionReference,
      }),
    ).toEqual({ deleted: true });
    expect(
      await storage.deleteSession({
        ownerUserId,
        connectionId,
        sessionReference,
      }),
    ).toEqual({ deleted: false });
    expect(
      await storage.hasSession({
        ownerUserId,
        connectionId,
        sessionReference,
      }),
    ).toBe(false);
    const allFiles = await walkFiles(root);
    expect(allFiles.some((file) => file.includes(".tmp-"))).toBe(false);
  });

  it("rejects configs with weak secrets or invalid limits", async () => {
    const root = await mkdtemp(join(tmpdir(), "nuvitae-sessions-config-"));
    roots.push(root);
    await expect(
      LocalProviderSessionStorage.create({
        root,
        encryptionSecret: "too-short",
        maxSessionBytes: 1024,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INTERNAL_SESSION_STORAGE_FAILURE" }),
    );
    await expect(
      LocalProviderSessionStorage.create({
        root,
        encryptionSecret: secret,
        maxSessionBytes: 0,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INTERNAL_SESSION_STORAGE_FAILURE" }),
    );
  });
});

async function walkFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        result.push(path);
      }
    }
  };
  await visit(root);
  return result;
}
