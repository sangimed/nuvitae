import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const evidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../evidence");
const campaignBDecision = path.resolve(evidence, "../../../docs/research/codex-direct-oauth-t201-c02-campaign-b-decision.md");
const expected = {
  "codex-direct-oauth-t201-c02-semantic-parsing.json": "a8a39c118e43860a29008f75743f695ecbd9e78ba301746111ddb6be3abbb9dc",
  "codex-direct-oauth-t201-c02-attempt-2-semantic-parsing.json": "f612fc483a98f082762a20712e681607c5900c7d97e33aca7cccabcc7212c1ac",
  "codex-direct-oauth-t201-c02-attempt-3-semantic-parsing.json": "201a991ddb78ec51bdef4ac174deaf11a31207d87b7c926e502837cc0ff27c4e",
  "codex-direct-oauth-t201-c02-attempt-4-semantic-parsing.json": "da16efce38d6ae425300aa823325601bc730c65b59c0a001258af3ac289ea538",
  "codex-direct-oauth-t201-c02-attempt-5-semantic-parsing.json": "e18c18d61eec1925d0c40b174610b5a9f7c01c2d47c8b5659351b7e08ecd3d41",
  "codex-direct-oauth-t201-c02-attempt-6-semantic-parsing.json": "ae29cab52255e9e5c4763d63ae722dd07387e12e8f2f92647f55e649d1af0c2d",
};

const campaignBExpected = {
  "codex-direct-oauth-t201-c02-b01-semantic-parsing.json": "f1650e9c20f95d80b7d41d8e1b8b81bc90de12facdb46efe052f00bf86ca6764",
  "codex-direct-oauth-t201-c02-b02-semantic-parsing.json": "f8cb50657b956620341b29c40c231e7f730decbf7a218b3af069ea9febfac066",
};

test("T201 C02 Campaign A attempts 1-6 remain byte-identical", async () => {
  for (const [file, expectedHash] of Object.entries(expected)) {
    const bytes = await fs.readFile(path.join(evidence, file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expectedHash, file);
  }
});

test("T201 C02 Campaign B B01 and B02 remain byte-identical", async () => {
  for (const [file, expectedHash] of Object.entries(campaignBExpected)) {
    const bytes = await fs.readFile(path.join(evidence, file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expectedHash, file);
  }
});

test("the Campaign-B decision record remains byte-identical", async () => {
  const bytes = await fs.readFile(campaignBDecision);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), "98a5d7e5f5d32398e4f5c1913ca9315f981c28e56f70d5caa84ea19e0575c3e8");
});
