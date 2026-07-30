import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const spikeDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(spikeDir, "../..");
const roots = [
  spikeDir,
  resolve(repoRoot, "docs/research/codex-app-server-authentication-lifecycle.md"),
];

const patterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /refresh[_-]?token["':=\s]+[A-Za-z0-9._-]{12,}/i,
  /access[_-]?token["':=\s]+[A-Za-z0-9._-]{12,}/i,
  /id[_-]?token["':=\s]+[A-Za-z0-9._-]{12,}/i,
  /authorization:\s*bearer\s+[A-Za-z0-9._-]+/i,
  /device_code["':=\s]+[A-Za-z0-9._-]{6,}/i,
  /user_code["':=\s]+[A-Z0-9-]{6,}/,
];

const files = spawnSync("find", roots, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).stdout.split("\n").filter(Boolean);

let failed = false;
for (const file of files) {
  try {
    const text = await readFile(file, "utf8");
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        console.error(`possible secret pattern in ${file}: ${pattern}`);
        failed = true;
      }
    }
  } catch {
    // Ignore binary or absent files.
  }
}

if (failed) process.exit(1);
console.log("T191 spike secret scan passed");
