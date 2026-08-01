import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const evidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../evidence");
const expected = {
  "codex-direct-oauth-t201-c02-semantic-parsing.json": "a8a39c118e43860a29008f75743f695ecbd9e78ba301746111ddb6be3abbb9dc",
  "codex-direct-oauth-t201-c02-attempt-2-semantic-parsing.json": "f612fc483a98f082762a20712e681607c5900c7d97e33aca7cccabcc7212c1ac",
  "codex-direct-oauth-t201-c02-attempt-3-semantic-parsing.json": "201a991ddb78ec51bdef4ac174deaf11a31207d87b7c926e502837cc0ff27c4e",
  "codex-direct-oauth-t201-c02-attempt-4-semantic-parsing.json": "da16efce38d6ae425300aa823325601bc730c65b59c0a001258af3ac289ea538",
  "codex-direct-oauth-t201-c02-attempt-5-semantic-parsing.json": "e18c18d61eec1925d0c40b174610b5a9f7c01c2d47c8b5659351b7e08ecd3d41",
  "codex-direct-oauth-t201-c02-attempt-6-semantic-parsing.json": "ae29cab52255e9e5c4763d63ae722dd07387e12e8f2f92647f55e649d1af0c2d",
};

test("T201 C02 Campaign A attempts 1-6 remain byte-identical", async () => {
  for (const [file, expectedHash] of Object.entries(expected)) {
    const bytes = await fs.readFile(path.join(evidence, file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expectedHash, file);
  }
});
