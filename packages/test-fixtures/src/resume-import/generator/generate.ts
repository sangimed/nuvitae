import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format as formatWithPrettier } from "prettier";

import { contentForSpec, stressSpec } from "./content-factory.js";
import {
  resumeImportFixtureSpecs,
  type ResumeFixtureSpec,
} from "./fixture-spec.js";
import { applyMutation } from "./mutations.js";
import { renderDocx } from "./renderers/docx.js";
import { renderPdf } from "./renderers/pdf.js";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);
const checksumPath = "packages/test-fixtures/resume-import/checksums.json";

export async function generateFixtureBytes(
  spec: ResumeFixtureSpec,
): Promise<Uint8Array> {
  const content = contentForSpec(spec);
  const rendered =
    spec.format === "pdf"
      ? await renderPdf(spec, content)
      : await renderDocx(spec, content);
  return applyMutation(spec, rendered);
}

export async function generateCoreCorpus(): Promise<void> {
  const checksums: Record<string, string> = {};
  for (const spec of resumeImportFixtureSpecs) {
    const bytes = await generateFixtureBytes(spec);
    await writeFixture(spec, bytes);
    checksums[spec.fixtureId] = sha256(bytes);
    printReproduction(spec, bytes);
  }
  await writeJson(checksumPath, {
    rendererVersion: resumeImportFixtureSpecs[0]?.rendererVersion,
    fixtures: checksums,
  });
}

export async function verifyCoreCorpus(): Promise<void> {
  const checksumDocument = JSON.parse(
    await readFile(resolve(repositoryRoot, checksumPath), "utf8"),
  ) as { readonly fixtures: Readonly<Record<string, string>> };
  const failures: string[] = [];
  for (const spec of resumeImportFixtureSpecs) {
    const first = await generateFixtureBytes(spec);
    const second = await generateFixtureBytes(spec);
    const generatedHash = sha256(first);
    const checkedInHash = sha256(
      await readFile(resolve(repositoryRoot, spec.outputPath)),
    );
    if (!Buffer.from(first).equals(Buffer.from(second))) {
      failures.push(`${spec.fixtureId}: two generations differ`);
    }
    if (generatedHash !== checkedInHash) {
      failures.push(
        `${spec.fixtureId}: generated ${generatedHash}, checked-in ${checkedInHash}`,
      );
    }
    if (generatedHash !== checksumDocument.fixtures[spec.fixtureId]) {
      failures.push(`${spec.fixtureId}: checksum index is stale`);
    }
    printReproduction(spec, first);
  }
  if (failures.length > 0)
    throw new Error(`Fixture determinism failed:\n${failures.join("\n")}`);
  console.log(
    `Verified ${resumeImportFixtureSpecs.length} deterministic core fixtures.`,
  );
}

export async function generateStressCorpus(
  seed: number,
  count: number,
): Promise<void> {
  if (
    !Number.isSafeInteger(seed) ||
    !Number.isSafeInteger(count) ||
    count < 1
  ) {
    throw new Error("--seed and --count must be positive safe integers");
  }
  for (let index = 0; index < count; index += 1) {
    const format = index % 2 === 0 ? "pdf" : "docx";
    const spec = stressSpec(seed, index, format);
    const bytes = await generateFixtureBytes(spec);
    await writeFixture(spec, bytes);
    printReproduction(spec, bytes);
  }
}

async function writeFixture(
  spec: ResumeFixtureSpec,
  bytes: Uint8Array,
): Promise<void> {
  const absolutePath = resolve(repositoryRoot, spec.outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
  await writeJson(`${spec.outputPath}.oracle.json`, {
    fixtureId: spec.fixtureId,
    seed: spec.seed,
    format: spec.format,
    language: spec.language,
    layout: spec.layout,
    profile: spec.profile,
    complexity: spec.complexity,
    mutation: spec.mutation,
    rendererVersion: spec.rendererVersion,
    sha256: sha256(bytes),
    oracle: spec.oracle,
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(repositoryRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    await formatWithPrettier(JSON.stringify(value), { parser: "json" }),
  );
}

function printReproduction(spec: ResumeFixtureSpec, bytes: Uint8Array): void {
  console.log(
    [
      `fixtureId=${spec.fixtureId}`,
      `seed=${spec.seed}`,
      `format=${spec.format}`,
      `layout=${spec.layout}`,
      `profile=${spec.profile}`,
      `rendererVersion=${spec.rendererVersion}`,
      `sha256=${sha256(bytes)}`,
    ].join(" "),
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(arguments_: readonly string[]): Promise<void> {
  const mode = valueAfter(arguments_, "--mode") ?? "core";
  if (arguments_.includes("--check")) {
    await verifyCoreCorpus();
    return;
  }
  if (mode === "core") {
    await generateCoreCorpus();
    return;
  }
  if (mode === "stress") {
    await generateStressCorpus(
      Number(valueAfter(arguments_, "--seed") ?? "1337"),
      Number(valueAfter(arguments_, "--count") ?? "100"),
    );
    return;
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

function valueAfter(
  arguments_: readonly string[],
  flag: string,
): string | undefined {
  const index = arguments_.indexOf(flag);
  return index === -1 ? undefined : arguments_[index + 1];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2));
}
