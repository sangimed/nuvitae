import { describe, expect, it } from "vitest";
import {
  nuvitaeSemanticExtractionResponseSchema,
  semanticAmbiguityCodeSchema,
  semanticClassificationSchema,
  semanticConfidenceSchema,
  type NuvitaeSemanticExtractionResponse,
  type SemanticValue,
} from "@nuvitae/contracts";
import {
  validateSemanticExtractionResponse,
  validateSemanticParseRequest,
  validateSemanticResponse,
} from "@nuvitae/import-application";
import { deterministicFixtureProfiles } from "@nuvitae/import-application/testing";

import {
  buildSemanticParserFixtureRequest,
  normalizeFixtureText,
  semanticParserFixtureIds,
  semanticParserFixtureInputs,
} from "./semantic-parser-fixtures.js";
import {
  expectedSemanticJsonById,
  semanticParserFixtures,
} from "./expected-semantic-json.js";

const allowedRelationshipTypes = new Set([
  "role_belongs_to_employer",
  "achievement_belongs_to_role",
  "skill_belongs_to_category",
  "link_belongs_to_project",
]);

const expectedLanguageFormatPairs = new Set([
  "english:pdf",
  "english:docx",
  "french:pdf",
  "french:docx",
  "bilingual_french_english:pdf",
  "bilingual_french_english:docx",
]);

const expectedFormatLayoutPairs = new Set([
  "pdf:single_column",
  "pdf:multi_column",
  "docx:single_column",
  "docx:multi_column",
]);

const expectedLanguageLayoutPairs = new Set([
  "english:single_column",
  "english:multi_column",
  "french:single_column",
  "french:multi_column",
  "bilingual_french_english:single_column",
  "bilingual_french_english:multi_column",
]);

interface FactRef {
  readonly id: string;
  readonly value: SemanticValue;
}

function collectFacts(response: NuvitaeSemanticExtractionResponse): FactRef[] {
  const facts: FactRef[] = [];
  const add = (id: string, value: SemanticValue | null): void => {
    if (value !== null) facts.push({ id, value });
  };
  const contact = response.sections.contact;
  add("contact.fullName", contact.fullName);
  add("contact.email", contact.email);
  add("contact.phone", contact.phone);
  add("contact.location", contact.location);
  add("contact.website", contact.website);
  add("headline", response.sections.headline);
  add("summary", response.sections.summary);
  for (const work of response.sections.workExperience) {
    add(`work.${work.candidateId}.employerName`, work.employerName);
    add(`work.${work.candidateId}.employerLocation`, work.employerLocation);
    for (const role of work.roles) {
      add(
        `work.${work.candidateId}.role.${role.candidateId}.title`,
        role.title,
      );
      add(
        `work.${work.candidateId}.role.${role.candidateId}.location`,
        role.location,
      );
      add(
        `work.${work.candidateId}.role.${role.candidateId}.startDate`,
        role.startDate,
      );
      add(
        `work.${work.candidateId}.role.${role.candidateId}.endDate`,
        role.endDate,
      );
      role.responsibilities.forEach((item, index) =>
        add(
          `work.${work.candidateId}.role.${role.candidateId}.responsibilities.${index}`,
          item,
        ),
      );
      role.achievements.forEach((item, index) =>
        add(
          `work.${work.candidateId}.role.${role.candidateId}.achievements.${index}`,
          item,
        ),
      );
    }
  }
  for (const education of response.sections.education) {
    add(
      `education.${education.candidateId}.institution`,
      education.institution,
    );
    add(`education.${education.candidateId}.degree`, education.degree);
    add(
      `education.${education.candidateId}.fieldOfStudy`,
      education.fieldOfStudy,
    );
    add(`education.${education.candidateId}.startDate`, education.startDate);
    add(`education.${education.candidateId}.endDate`, education.endDate);
    add(`education.${education.candidateId}.location`, education.location);
    education.details.forEach((item, index) =>
      add(`education.${education.candidateId}.details.${index}`, item),
    );
  }
  response.sections.skills.forEach((skill) => {
    add(`skills.${skill.candidateId}.name`, skill.name);
    add(`skills.${skill.candidateId}.category`, skill.category);
  });
  response.sections.languages.forEach((language) => {
    add(`languages.${language.candidateId}.name`, language.name);
    add(`languages.${language.candidateId}.proficiency`, language.proficiency);
  });
  response.sections.projects.forEach((project) => {
    add(`projects.${project.candidateId}.name`, project.name);
    add(`projects.${project.candidateId}.description`, project.description);
    project.technologies.forEach((item, index) =>
      add(`projects.${project.candidateId}.technologies.${index}`, item),
    );
    project.links.forEach((item, index) =>
      add(`projects.${project.candidateId}.links.${index}`, item),
    );
  });
  response.sections.certifications.forEach((certification) => {
    add(`certifications.${certification.candidateId}.name`, certification.name);
    add(
      `certifications.${certification.candidateId}.issuer`,
      certification.issuer,
    );
    add(`certifications.${certification.candidateId}.date`, certification.date);
  });
  response.sections.professionalLinks.forEach((link, index) =>
    add(`professionalLinks.${index}`, link),
  );
  return facts;
}

describe("T169 semantic parser fixtures", () => {
  it("covers the complete language, format, and layout matrix with stable IDs", () => {
    expect([...semanticParserFixtureIds]).toEqual([
      "pdf-english-anonymous",
      "docx-english-anonymous",
      "pdf-french-anonymous",
      "pdf-french-canonical-anonymous",
      "docx-french-anonymous",
      "pdf-bilingual-anonymous",
      "docx-bilingual-anonymous",
      "pdf-english-multi-column-anonymous",
      "docx-french-multi-column-anonymous",
    ]);
    const languageFormat = new Set<string>();
    const formatLayout = new Set<string>();
    const languageLayout = new Set<string>();
    for (const fixture of semanticParserFixtures) {
      languageFormat.add(`${fixture.language}:${fixture.format}`);
      formatLayout.add(`${fixture.format}:${fixture.layout}`);
      languageLayout.add(`${fixture.language}:${fixture.layout}`);
    }
    expect(languageFormat).toEqual(expectedLanguageFormatPairs);
    expect(formatLayout).toEqual(expectedFormatLayoutPairs);
    expect(languageLayout).toEqual(expectedLanguageLayoutPairs);
  });

  it("declares canonical flattened evidence with valid line, start, end, hash, and bounds", () => {
    for (const fixture of semanticParserFixtures) {
      const fragments = fixture.fragments;
      expect(fragments.length).toBeGreaterThan(0);
      expect(fixture.fragmentHashes).toHaveLength(fragments.length);
      expect(fixture.transcript.lineCount).toBe(fragments.length);
      expect(fixture.transcript.text).toBe(
        fragments.map((fragment) => fragment.text).join("\n"),
      );
      fragments.forEach((fragment, index) => {
        expect(fragment.order).toBe(index);
        expect(fragment.line).toBe(index + 1);
        expect(fragment.text).toBe(normalizeFixtureText(fragment.text));
        expect(fragment.text.length).toBeGreaterThan(0);
        expect(fragment.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(fixture.fragmentHashes[index]).toBe(fragment.hash);
        expect(fragment.bounds).toEqual({
          lineStart: index + 1,
          lineEnd: index + 1,
          start: 0,
          end: fragment.text.length,
        });
      });
      const request = buildSemanticParserFixtureRequest(fixture.id);
      const validated = validateSemanticParseRequest(request);
      expect(validated.ok, `fixture ${fixture.id} request must be valid`).toBe(
        true,
      );
    }
  });

  it("produces schema-valid expected semantic JSON for every fixture", () => {
    for (const fixture of semanticParserFixtures) {
      const response = fixture.expectedResponse;
      expect(
        nuvitaeSemanticExtractionResponseSchema.safeParse(response).success,
        `fixture ${fixture.id} must satisfy the extraction schema`,
      ).toBe(true);
      const validated = validateSemanticExtractionResponse(response);
      expect(
        validated.ok,
        `fixture ${fixture.id} expected JSON must pass strict response validation`,
      ).toBe(true);
    }
  });

  it("passes the full provider-neutral pipeline: grounding, no invention, absence, and acceptance", () => {
    for (const fixture of semanticParserFixtures) {
      const validation = validateSemanticResponse({
        request: buildSemanticParserFixtureRequest(fixture.id),
        response: fixture.expectedResponse,
      });
      expect(
        validation,
        `fixture ${fixture.id} must pass every validation gate`,
      ).toMatchObject({
        schemaValid: true,
        evidenceValid: true,
        groundingValid: true,
        absenceValid: true,
        ambiguityValid: true,
        conflictValid: true,
        noInventionValid: true,
        injectionResistant: true,
        accepted: true,
      });
    }
  });

  it("uses explicit nulls for absent values and empty arrays for absent collections", () => {
    for (const fixture of semanticParserFixtures) {
      expectNoUndefined(fixture.expectedResponse);
      const absentCollections =
        fixture.expectedResponse.sections.projects.length === 0
          ? ["projects"]
          : [];
      if (fixture.expectedResponse.sections.certifications.length === 0) {
        absentCollections.push("certifications");
      }
      if (fixture.expectedResponse.sections.professionalLinks.length === 0) {
        absentCollections.push("professionalLinks");
      }
      for (const name of absentCollections) {
        expect(
          fixture.expectedResponse.sections[
            name as "projects" | "certifications" | "professionalLinks"
          ],
        ).toEqual([]);
      }
      expect(fixture.expectedResponse.sections.contact.website ?? null).toBe(
        null,
      );
    }
  });

  it("grounds every non-null value in the exact flattened source text", () => {
    for (const fixture of semanticParserFixtures) {
      const request = buildSemanticParserFixtureRequest(fixture.id);
      for (const fact of collectFacts(fixture.expectedResponse)) {
        const grounded = fact.value.evidence.some((evidence) => {
          const fragment = request.sourceFragments.find(
            (candidate) =>
              candidate.hash === evidence.fragmentHash &&
              candidate.line === evidence.line,
          );
          return (
            fragment !== undefined &&
            normalizeFixtureText(
              fragment.text.slice(evidence.start, evidence.end),
            ).toLocaleLowerCase() ===
              normalizeFixtureText(fact.value.value).toLocaleLowerCase()
          );
        });
        expect(
          grounded,
          `fixture ${fixture.id} fact ${fact.id} must be grounded`,
        ).toBe(true);
      }
    }
  });

  it("references only existing candidates from grounded relationships", () => {
    for (const fixture of semanticParserFixtures) {
      const response = fixture.expectedResponse;
      const workIds = new Set(
        response.sections.workExperience.map((work) => work.candidateId),
      );
      const roleIds = new Set(
        response.sections.workExperience.flatMap((work) =>
          work.roles.map((role) => role.candidateId),
        ),
      );
      for (const relationship of response.relationships) {
        expect(
          allowedRelationshipTypes.has(relationship.relationshipType),
          `fixture ${fixture.id} has an unknown relationship type`,
        ).toBe(true);
        expect(
          workIds.has(relationship.toCandidateId),
          `fixture ${fixture.id} relationship ${relationship.candidateId} targets a missing employer`,
        ).toBe(true);
        expect(
          roleIds.has(relationship.fromCandidateId),
          `fixture ${fixture.id} relationship ${relationship.candidateId} references a missing role`,
        ).toBe(true);
        expect(relationship.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps classifications, confidence, and review semantics valid and representative", () => {
    for (const fixture of semanticParserFixtures) {
      for (const fact of collectFacts(fixture.expectedResponse)) {
        expect(
          semanticClassificationSchema.safeParse(fact.value.classification)
            .success,
          `fixture ${fixture.id} fact ${fact.id} has an invalid classification`,
        ).toBe(true);
        expect(
          semanticConfidenceSchema.safeParse(fact.value.confidence).success,
          `fixture ${fixture.id} fact ${fact.id} has an invalid confidence`,
        ).toBe(true);
        expect(
          fact.value.classification,
          `fixture ${fixture.id} fact ${fact.id} must stay explicit under the current no-invention gate`,
        ).toBe("explicit");
      }
      const validation = validateSemanticResponse({
        request: buildSemanticParserFixtureRequest(fixture.id),
        response: fixture.expectedResponse,
      });
      expect(
        validation.requiresReview,
        `fixture ${fixture.id} inferred or ambiguous content must require review`,
      ).toBe(fixture.expectedResponse.ambiguityDiagnostics.length > 0);
    }
  });

  it("flags an inferred classification for review and rejects it under the no-invention gate", () => {
    const fixture = pdfBilingualFixture();
    const mutated = structuredClone(fixture.expectedResponse);
    if (mutated.sections.summary === null) throw new Error("missing summary");
    mutated.sections.summary = {
      ...mutated.sections.summary,
      classification: "inferred",
    };
    const validation = validateSemanticResponse({
      request: buildSemanticParserFixtureRequest(fixture.id),
      response: mutated,
    });
    expect(validation.noInventionValid).toBe(false);
    expect(validation.accepted).toBe(false);
    expect(
      validation.diagnostics.some(
        (item) => item.code === "inferred_fact_requires_review",
      ),
    ).toBe(true);
  });

  it("emits grounded, valid, privacy-safe ambiguity diagnostics", () => {
    for (const fixture of semanticParserFixtures) {
      const response = fixture.expectedResponse;
      for (const diagnostic of response.ambiguityDiagnostics) {
        expect(
          semanticAmbiguityCodeSchema.safeParse(diagnostic.code).success,
          `fixture ${fixture.id} has an unknown ambiguity code`,
        ).toBe(true);
        expect(diagnostic.evidence.length).toBeGreaterThan(0);
        expect(diagnostic.severity).toBe("warning");
        expect(diagnostic.safeDetail?.length).toBeGreaterThan(0);
      }
      const validated = validateSemanticResponse({
        request: buildSemanticParserFixtureRequest(fixture.id),
        response,
      });
      expect(validated.ambiguityValid).toBe(true);
      expect(validated.requiresReview).toBe(
        response.ambiguityDiagnostics.length > 0,
      );
    }
  });

  it("keeps fixture, candidate, evidence, and fact identifiers unique", () => {
    const fixtureIds = semanticParserFixtures.map((fixture) => fixture.id);
    expect(new Set(fixtureIds).size).toBe(fixtureIds.length);
    for (const fixture of semanticParserFixtures) {
      const response = fixture.expectedResponse;
      const candidateIds = collectCandidateIds(response);
      expect(
        candidateIds.length,
        `fixture ${fixture.id} candidate IDs must be unique`,
      ).toBe(new Set(candidateIds).size);
      const factIds = collectFacts(response).map((fact) => fact.id);
      expect(
        factIds.length,
        `fixture ${fixture.id} fact IDs must be unique`,
      ).toBe(new Set(factIds).size);
      for (const fact of collectFacts(response)) {
        const keys = fact.value.evidence.map(
          (evidence) =>
            `${evidence.fragmentHash}:${evidence.line}:${evidence.start}:${evidence.end}`,
        );
        expect(
          keys.length,
          `fixture ${fixture.id} fact ${fact.id} evidence must be unique within the value`,
        ).toBe(new Set(keys).size);
      }
      for (const relationship of response.relationships) {
        const keys = relationship.evidence.map(
          (evidence) =>
            `${evidence.fragmentHash}:${evidence.line}:${evidence.start}:${evidence.end}`,
        );
        expect(
          keys.length,
          `fixture ${fixture.id} relationship ${relationship.candidateId} evidence must be unique`,
        ).toBe(new Set(keys).size);
      }
    }
  });

  it("reuses the T210 deterministic-provider fixtures without conflicting definitions", () => {
    for (const fixtureId of [
      "pdf-english-anonymous",
      "docx-english-anonymous",
    ] as const) {
      const profile = deterministicFixtureProfiles.find(
        (candidate) => candidate.profileId === fixtureId,
      );
      expect(profile, `T210 profile ${fixtureId} must exist`).toBeDefined();
      if (profile === undefined) continue;
      const input = semanticParserFixtureInputs[fixtureId];
      expect(input).toBeDefined();
      if (input === undefined) continue;
      expect(JSON.stringify(input.transcript)).toBe(
        JSON.stringify(profile.transcript),
      );
      expect(JSON.stringify(input.fragments)).toBe(
        JSON.stringify(profile.fragments),
      );
      expect(JSON.stringify(input.fragmentHashes)).toBe(
        JSON.stringify(profile.fragmentHashes),
      );
      expect(JSON.stringify(input.formatMetadata)).toBe(
        JSON.stringify(profile.formatMetadata),
      );
      expect(JSON.stringify(expectedSemanticJsonById[fixtureId])).toBe(
        JSON.stringify(profile.response),
      );
    }
  });
});

function expectNoUndefined(value: unknown, path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectNoUndefined(item, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    expect(item, `undefined at ${path}.${key}`).not.toBeUndefined();
    expectNoUndefined(item, `${path}.${key}`);
  }
}

function collectCandidateIds(
  response: NuvitaeSemanticExtractionResponse,
): string[] {
  const ids: string[] = [];
  for (const work of response.sections.workExperience) {
    ids.push(work.candidateId);
    for (const role of work.roles) ids.push(role.candidateId);
  }
  for (const education of response.sections.education) {
    ids.push(education.candidateId);
  }
  for (const skill of response.sections.skills) ids.push(skill.candidateId);
  for (const language of response.sections.languages) {
    ids.push(language.candidateId);
  }
  for (const project of response.sections.projects) {
    ids.push(project.candidateId);
  }
  for (const certification of response.sections.certifications) {
    ids.push(certification.candidateId);
  }
  for (const relationship of response.relationships) {
    ids.push(relationship.candidateId);
  }
  return ids;
}

function pdfBilingualFixture(): (typeof semanticParserFixtures)[number] {
  const fixture = semanticParserFixtures.find(
    (candidate) => candidate.id === "pdf-bilingual-anonymous",
  );
  if (fixture === undefined) throw new Error("Missing bilingual PDF fixture.");
  return fixture;
}
