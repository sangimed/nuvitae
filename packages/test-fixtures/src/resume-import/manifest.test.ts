import { describe, expect, it } from "vitest";

import {
  requiredResumeImportFixtureCategories,
  resumeImportFixtureManifest,
  type FixtureCategory,
} from "./manifest.js";

describe("resume import fixture manifest", () => {
  it("uses unique stable fixture ids", () => {
    const ids = resumeImportFixtureManifest.map((fixture) => fixture.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every required fixture category", () => {
    const coveredCategories = new Set<FixtureCategory>(
      resumeImportFixtureManifest.flatMap((fixture) => fixture.categories),
    );

    expect(
      [...requiredResumeImportFixtureCategories].filter(
        (category) => !coveredCategories.has(category),
      ),
    ).toEqual([]);
  });

  it("keeps fixture paths repository-relative and metadata-only", () => {
    for (const fixture of resumeImportFixtureManifest) {
      expect(fixture.futurePath).toMatch(
        /^packages\/test-fixtures\/resume-import\//,
      );
      expect(fixture).not.toHaveProperty("content");
      expect(fixture).not.toHaveProperty("personalData");
      expect(fixture).not.toHaveProperty("secret");
    }
  });

  it("does not allow draft creation for validation failures or unsupported language previews", () => {
    const disallowed = resumeImportFixtureManifest.filter(
      (fixture) =>
        fixture.expectedExtractionCategory === "validation_failure" ||
        fixture.expectedExtractionCategory ===
          "unsupported_language_contact_preview" ||
        fixture.expectedExtractionCategory === "no_supported_field",
    );

    expect(disallowed.every((fixture) => !fixture.mayCreateDraft)).toBe(true);
  });

  it("requires provenance expectations when a draft may be created", () => {
    const draftFixtures = resumeImportFixtureManifest.filter(
      (fixture) => fixture.mayCreateDraft,
    );

    expect(
      draftFixtures.every(
        (fixture) => fixture.provenance.sourceLocationRequired,
      ),
    ).toBe(true);
  });
});
