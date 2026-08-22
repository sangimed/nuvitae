import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { resumeImportFixtureManifest } from "../manifest.js";
import { stressSpec } from "./content-factory.js";
import { generateFixtureBytes } from "./generate.js";
import { resumeImportFixtureSpecs } from "./fixture-spec.js";

describe("deterministic resume-import fixture specs", () => {
  it("extends the existing manifest one-to-one with explicit specs and oracles", () => {
    expect(resumeImportFixtureSpecs.map((spec) => spec.fixtureId)).toEqual(
      resumeImportFixtureManifest.map((entry) => entry.id),
    );
    for (const spec of resumeImportFixtureSpecs) {
      expect(spec.seed).toBeGreaterThan(0);
      expect(spec.rendererVersion).toBe("nuvitae-resume-fixtures-v1");
      expect(spec.outputPath).toMatch(
        /^packages\/test-fixtures\/resume-import\//,
      );
      if (spec.mutation === "none" || spec.mutation === "mixed_text_image") {
        expect(spec.oracle.semantic).not.toBeNull();
      }
      if (spec.oracle.expectedFailureCategory !== undefined) {
        expect(spec.complexity).toBe("adversarial");
      }
    }
  });

  it("renders a real PDF and DOCX deterministically from their specs", async () => {
    for (const fixtureId of ["pdf-english-complete", "docx-french-complete"]) {
      const spec = resumeImportFixtureSpecs.find(
        (candidate) => candidate.fixtureId === fixtureId,
      )!;
      const first = await generateFixtureBytes(spec);
      const second = await generateFixtureBytes(spec);
      const checkedIn = await readFile(spec.outputPath);

      expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
      expect(Buffer.from(first).equals(checkedIn)).toBe(true);
      expect(
        Buffer.from(first).equals(
          Buffer.from(
            await generateFixtureBytes({ ...spec, seed: spec.seed + 1 }),
          ),
        ),
      ).toBe(false);
      expect(createHash("sha256").update(first).digest("hex")).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(first.subarray(0, 4).toString()).toBe(
        spec.format === "pdf" ? "%PDF" : "PK\u0003\u0004",
      );
    }
  });

  it("materializes every manifest path with a checksum-bound machine oracle", async () => {
    for (const spec of resumeImportFixtureSpecs) {
      const bytes = await readFile(spec.outputPath);
      const sidecar = JSON.parse(
        await readFile(`${spec.outputPath}.oracle.json`, "utf8"),
      ) as {
        readonly fixtureId: string;
        readonly sha256: string;
        readonly oracle: unknown;
      };
      expect(bytes.byteLength).toBeGreaterThan(0);
      expect(sidecar.fixtureId).toBe(spec.fixtureId);
      expect(sidecar.sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
      expect(sidecar.oracle).toEqual(spec.oracle);
    }
  });

  it("derives stress cases reproducibly from seed and index", async () => {
    const firstSpec = stressSpec(1337, 42, "pdf");
    const secondSpec = stressSpec(1337, 42, "pdf");
    const differentSpec = stressSpec(1338, 42, "pdf");
    expect(firstSpec).toEqual(secondSpec);
    expect(firstSpec).not.toEqual(differentSpec);
    expect(Buffer.from(await generateFixtureBytes(firstSpec))).toEqual(
      Buffer.from(await generateFixtureBytes(secondSpec)),
    );
  });

  it("uses only synthetic reserved-domain contact data", () => {
    const serialized = JSON.stringify(resumeImportFixtureSpecs);
    const emails = serialized.match(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((email) => email.endsWith("@example.test"))).toBe(true);
    expect(serialized).not.toMatch(/@(gmail|hotmail|outlook|yahoo)\./i);
  });
});
