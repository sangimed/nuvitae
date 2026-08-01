import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const spikeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dockerfile = path.join(spikeRoot, "Dockerfile");

test("T201 image Dockerfile normalizes copied runtime module ownership and modes", async () => {
  const source = await fs.readFile(dockerfile, "utf8");
  assert.match(source, /COPY --chown=spike:spike \. \/spike/);
  assert.match(source, /find \/spike -type d -exec chmod 0755 \{\} \+/);
  assert.match(
    source,
    /find \/spike -type f -name '\*\.mjs' -exec chmod 0644 \{\} \+/,
  );
  assert.match(source, /install -d -o spike -g spike -m 0700 \/spike\/result/);
});

test(
  "T201 image runtime modules are readable and importable by spike",
  { skip: process.env.NUVITAE_RUN_T201_IMAGE_TEST !== "1" },
  async () => {
    const tag = `nuvitae-codex-direct-oauth-t201-permissions-${process.pid}`;
    await execFileAsync(
      "docker",
      ["build", "--pull=false", "--tag", tag, "."],
      { cwd: spikeRoot },
    );
    try {
      const stat = await execFileAsync("docker", [
        "run",
        "--rm",
        "--entrypoint",
        "/bin/sh",
        tag,
        "-c",
        'id && stat -c "%A %a %u:%g %n" /spike /spike/lib /spike/lib/t201-matrix-evaluator.mjs /spike/t201-semantic-broker.mjs && test -z "$(find /spike -type f -name \'*.mjs\' \\( ! -user spike -o ! -perm -004 \\) -print -quit)"',
      ]);
      assert.match(stat.stdout, /uid=100\(spike\) gid=101\(spike\)/);
      assert.doesNotMatch(stat.stdout, /600 root:root/);

      const imported = await execFileAsync("docker", [
        "run",
        "--rm",
        "--network",
        "none",
        "--entrypoint",
        "node",
        tag,
        "--input-type=module",
        "-e",
        'await import("./lib/t201-matrix-evaluator.mjs"); await import("./t201-semantic-broker.mjs").catch((error) => { if (error?.code === "ENOENT" || error?.message?.includes("transport_failure")) process.exit(0); throw error; }); console.log("runtime_imports_readable");',
      ]).catch((error) => error);
      assert.ok(imported.code === undefined || [0, 1].includes(imported.code));
      assert.match(imported.stdout, /runtime_imports_readable/);
    } finally {
      await execFileAsync("docker", ["image", "rm", "--force", tag]).catch(
        () => undefined,
      );
    }
  },
);
