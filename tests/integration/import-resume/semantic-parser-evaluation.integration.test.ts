import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";
import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
  SemanticEvidence,
  SemanticValue,
} from "@nuvitae/contracts";
import {
  createPrivacySafeSemanticProviderError,
  validateSemanticResponse,
  type ResumeSemanticParserProvider,
  type SemanticProviderErrorCode,
} from "@nuvitae/import-application";
import { createDeterministicSemanticParserProvider } from "@nuvitae/import-application/testing";
import {
  buildSemanticParserFixtureRequest,
  semanticParserFixtures,
  type SemanticParserFixture,
  type SemanticParserFixtureId,
} from "@nuvitae/test-fixtures";

/**
 * T170 semantic-parser evaluation.
 *
 * The suite measures field precision, field recall, work-experience grouping
 * accuracy, valid-evidence rate, invented-field rate, latency, and provider
 * failure behavior over the T169 corpus.
 *
 * Metrics are reported as a **provider-independent deterministic baseline
 * only**. No production acceptance thresholds exist yet (T201 is incomplete
 * and T203 remains blocked), so no Codex-specific threshold is asserted.
 * The only asserted gates are hard correctness invariants: no invented
 * fields, no invalid evidence, no schema violations, and no silent provider
 * failures. Failure diagnostics never include resume text or personal data.
 */

interface FactRef {
  readonly id: string;
  readonly value: SemanticValue;
}

interface GroupingRef {
  readonly roleCandidateId: string;
  readonly employerCandidateId: string;
}

interface EvaluationReport {
  readonly fixtureId: SemanticParserFixtureId;
  readonly format: string;
  readonly language: string;
  readonly layout: string;
  readonly expectedFactCount: number;
  readonly returnedFactCount: number;
  readonly correctFactCount: number;
  readonly precision: number;
  readonly recall: number;
  readonly expectedGroupingCount: number;
  readonly correctGroupingCount: number;
  readonly groupingAccuracy: number;
  readonly validEvidenceRate: number;
  readonly inventedFieldRate: number;
  readonly inventedFieldCount: number;
  readonly latencyMs: number | null;
  readonly providerOk: boolean;
  readonly providerErrorCode: string | null;
  readonly schemaValid: boolean;
  readonly evidenceValid: boolean;
  readonly noInventionValid: boolean;
  readonly absenceValid: boolean;
  readonly accepted: boolean;
  readonly exactMatch: boolean;
  readonly violations: readonly string[];
}

type ProviderRunReport =
  | { readonly kind: "ok"; readonly report: EvaluationReport }
  | {
      readonly kind: "provider_error";
      readonly fixtureId: SemanticParserFixtureId;
      readonly code: SemanticProviderErrorCode | "unknown_provider_failure";
      readonly retryable: boolean;
      readonly latencyMs: number;
    };

function normalizeValue(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function valuesEquivalent(left: string, right: string): boolean {
  return normalizeValue(left) === normalizeValue(right);
}

function collectFacts(response: NuvitaeSemanticExtractionResponse): FactRef[] {
  const facts: FactRef[] = [];
  if (
    typeof response?.sections !== "object" ||
    response.sections === null ||
    typeof response.sections.contact !== "object" ||
    response.sections.contact === null
  ) {
    return facts;
  }
  const add = (id: string, value: SemanticValue | null | undefined): void => {
    if (value !== null && value !== undefined) facts.push({ id, value });
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

function collectGroupings(
  response: NuvitaeSemanticExtractionResponse,
): GroupingRef[] {
  return (response?.relationships ?? [])
    .filter(
      (relationship) =>
        relationship.relationshipType === "role_belongs_to_employer",
    )
    .map((relationship) => ({
      roleCandidateId: relationship.fromCandidateId,
      employerCandidateId: relationship.toCandidateId,
    }));
}

function groupingKey(grouping: GroupingRef): string {
  return `${grouping.roleCandidateId}@${grouping.employerCandidateId}`;
}

function fragmentByHashAndLine(
  request: ResumeSemanticParseRequest,
): Map<string, ResumeSemanticParseRequest["sourceFragments"][number]> {
  const map = new Map<
    string,
    ResumeSemanticParseRequest["sourceFragments"][number]
  >();
  for (const fragment of request.sourceFragments) {
    map.set(`${fragment.hash}:${fragment.line}`, fragment);
  }
  return map;
}

function evidenceIsValid(
  fragment: ResumeSemanticParseRequest["sourceFragments"][number] | undefined,
  evidence: SemanticEvidence,
): boolean {
  if (fragment === undefined) return false;
  if (fragment.hash !== evidence.fragmentHash) return false;
  if (evidence.line !== fragment.line) return false;
  if (
    evidence.start < fragment.bounds.start ||
    evidence.end > fragment.bounds.end ||
    evidence.end <= evidence.start ||
    evidence.end > fragment.text.length
  ) {
    return false;
  }
  return (
    normalizeValue(fragment.text.slice(evidence.start, evidence.end)).length > 0
  );
}

function evaluateFixture(
  fixture: SemanticParserFixture,
  response: NuvitaeSemanticExtractionResponse,
  options?: {
    readonly latencyMs?: number;
    readonly providerOk?: boolean;
    readonly providerErrorCode?: string | null;
  },
): EvaluationReport {
  const request = buildSemanticParserFixtureRequest(fixture.id);
  const validation = validateSemanticResponse({ request, response });
  const fragments = fragmentByHashAndLine(request);

  const expectedFacts = collectFacts(fixture.expectedResponse);
  const returnedFacts = collectFacts(response);
  const expectedById = new Map(
    expectedFacts.map((fact) => [fact.id, fact.value]),
  );
  const correctFactCount = returnedFacts.filter(
    (fact) =>
      expectedById.has(fact.id) &&
      valuesEquivalent(fact.value.value, expectedById.get(fact.id)!.value),
  ).length;
  const precision =
    returnedFacts.length > 0 ? correctFactCount / returnedFacts.length : 0;
  const recall =
    expectedFacts.length > 0 ? correctFactCount / expectedFacts.length : 0;

  const expectedGroupings = collectGroupings(fixture.expectedResponse);
  const returnedGroupings = collectGroupings(response);
  const expectedGroupingKeys = new Set(expectedGroupings.map(groupingKey));
  const correctGroupingCount = returnedGroupings.filter((grouping) =>
    expectedGroupingKeys.has(groupingKey(grouping)),
  ).length;
  const groupingAccuracy =
    expectedGroupings.length > 0
      ? correctGroupingCount / expectedGroupings.length
      : 1;

  const validEvidenceFacts = returnedFacts.filter((fact) =>
    fact.value.evidence.some((evidence) =>
      evidenceIsValid(
        fragments.get(`${evidence.fragmentHash}:${evidence.line}`),
        evidence,
      ),
    ),
  ).length;
  const validEvidenceRate =
    returnedFacts.length > 0 ? validEvidenceFacts / returnedFacts.length : 0;

  const inventedFields = returnedFacts.filter((fact) => {
    const grounded = fact.value.evidence.some((evidence) => {
      const fragment = fragments.get(
        `${evidence.fragmentHash}:${evidence.line}`,
      );
      return (
        fragment !== undefined &&
        valuesEquivalent(
          fragment.text.slice(evidence.start, evidence.end),
          fact.value.value,
        )
      );
    });
    return !grounded;
  });
  const inventedFieldRate =
    returnedFacts.length > 0 ? inventedFields.length / returnedFacts.length : 0;

  const violations = validation.diagnostics
    .filter(
      (diagnostic) => !["ambiguity", "review"].includes(diagnostic.category),
    )
    .map(
      (diagnostic) =>
        `${diagnostic.category}:${diagnostic.code}:${diagnostic.path.join(".")}`,
    );
  if (validation.schemaValid && !validation.accepted) {
    violations.push("pipeline:not_accepted");
  }

  return {
    fixtureId: fixture.id,
    format: fixture.format,
    language: fixture.language,
    layout: fixture.layout,
    expectedFactCount: expectedFacts.length,
    returnedFactCount: returnedFacts.length,
    correctFactCount,
    precision,
    recall,
    expectedGroupingCount: expectedGroupings.length,
    correctGroupingCount,
    groupingAccuracy,
    validEvidenceRate,
    inventedFieldRate,
    inventedFieldCount: inventedFields.length,
    latencyMs: options?.latencyMs ?? null,
    providerOk: options?.providerOk ?? true,
    providerErrorCode: options?.providerErrorCode ?? null,
    schemaValid: validation.schemaValid,
    evidenceValid: validation.evidenceValid,
    noInventionValid: validation.noInventionValid,
    absenceValid: validation.absenceValid,
    accepted: validation.accepted,
    exactMatch:
      JSON.stringify(response) === JSON.stringify(fixture.expectedResponse),
    violations,
  };
}

async function runProviderEvaluation(
  fixture: SemanticParserFixture,
  provider: ResumeSemanticParserProvider,
): Promise<ProviderRunReport> {
  const request = buildSemanticParserFixtureRequest(fixture.id);
  const started = performance.now();
  try {
    const result = await provider.parse(request);
    const latencyMs = performance.now() - started;
    if (result.ok) {
      return {
        kind: "ok",
        report: evaluateFixture(fixture, result.response, {
          latencyMs,
          providerOk: true,
          providerErrorCode: null,
        }),
      };
    }
    return {
      kind: "provider_error",
      fixtureId: fixture.id,
      code: result.error.code,
      retryable: result.error.retryable,
      latencyMs,
    };
  } catch {
    return {
      kind: "provider_error",
      fixtureId: fixture.id,
      code: "unknown_provider_failure",
      retryable: true,
      latencyMs: performance.now() - started,
    };
  }
}

function mean(values: readonly number[]): number {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function printBaselineReport(reports: readonly EvaluationReport[]): void {
  const header =
    "provider-independent deterministic baseline only - no production acceptance thresholds defined (T201 incomplete, T203 blocked)";
  console.log(`\n[${header}]`);
  console.log(
    "| fixture | format | language | layout | precision | recall | grouping | evidence | invented | facts |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const report of reports) {
    console.log(
      [
        report.fixtureId,
        report.format,
        report.language,
        report.layout,
        report.precision.toFixed(3),
        report.recall.toFixed(3),
        report.groupingAccuracy.toFixed(3),
        report.validEvidenceRate.toFixed(3),
        report.inventedFieldRate.toFixed(3),
        `${report.correctFactCount}/${report.returnedFactCount}`,
      ].join(" | "),
    );
  }
  const global = aggregate(reports);
  console.log(
    `global | - | - | - | ${global.precision.toFixed(3)} | ${global.recall.toFixed(3)} | ${global.groupingAccuracy.toFixed(3)} | ${global.validEvidenceRate.toFixed(3)} | ${global.inventedFieldRate.toFixed(3)} | ${global.correctFactCount}/${global.returnedFactCount}`,
  );
  for (const key of ["language", "format", "layout"] as const) {
    for (const group of new Set(reports.map((report) => report[key]))) {
      const grouped = aggregate(
        reports.filter((report) => report[key] === group),
      );
      console.log(
        `group ${key}=${group}: precision ${grouped.precision.toFixed(3)}, recall ${grouped.recall.toFixed(3)}, grouping ${grouped.groupingAccuracy.toFixed(3)}, evidence ${grouped.validEvidenceRate.toFixed(3)}, invented ${grouped.inventedFieldRate.toFixed(3)}, facts ${grouped.correctFactCount}/${grouped.returnedFactCount}`,
      );
    }
  }
}

function aggregate(reports: readonly EvaluationReport[]): EvaluationReport {
  return {
    fixtureId: "aggregate" as SemanticParserFixtureId,
    format: "-",
    language: "-",
    layout: "-",
    expectedFactCount: reports.reduce(
      (total, report) => total + report.expectedFactCount,
      0,
    ),
    returnedFactCount: reports.reduce(
      (total, report) => total + report.returnedFactCount,
      0,
    ),
    correctFactCount: reports.reduce(
      (total, report) => total + report.correctFactCount,
      0,
    ),
    precision: mean(reports.map((report) => report.precision)),
    recall: mean(reports.map((report) => report.recall)),
    expectedGroupingCount: reports.reduce(
      (total, report) => total + report.expectedGroupingCount,
      0,
    ),
    correctGroupingCount: reports.reduce(
      (total, report) => total + report.correctGroupingCount,
      0,
    ),
    groupingAccuracy: mean(reports.map((report) => report.groupingAccuracy)),
    validEvidenceRate: mean(reports.map((report) => report.validEvidenceRate)),
    inventedFieldRate: mean(reports.map((report) => report.inventedFieldRate)),
    inventedFieldCount: reports.reduce(
      (total, report) => total + report.inventedFieldCount,
      0,
    ),
    latencyMs: null,
    providerOk: reports.every((report) => report.providerOk),
    providerErrorCode: null,
    schemaValid: reports.every((report) => report.schemaValid),
    evidenceValid: reports.every((report) => report.evidenceValid),
    noInventionValid: reports.every((report) => report.noInventionValid),
    absenceValid: reports.every((report) => report.absenceValid),
    accepted: reports.every((report) => report.accepted),
    exactMatch: reports.every((report) => report.exactMatch),
    violations: reports.flatMap((report) => report.violations),
  };
}

function expectBaselineInvariants(report: EvaluationReport): void {
  expect(report.precision, `${report.fixtureId} baseline precision`).toBe(1);
  expect(report.recall, `${report.fixtureId} baseline recall`).toBe(1);
  expect(
    report.groupingAccuracy,
    `${report.fixtureId} baseline grouping accuracy`,
  ).toBe(1);
  expect(
    report.validEvidenceRate,
    `${report.fixtureId} baseline valid-evidence rate`,
  ).toBe(1);
  expect(
    report.inventedFieldRate,
    `${report.fixtureId} baseline invented-field rate`,
  ).toBe(0);
  expect(report.schemaValid, `${report.fixtureId} schema gate`).toBe(true);
  expect(report.evidenceValid, `${report.fixtureId} evidence gate`).toBe(true);
  expect(report.noInventionValid, `${report.fixtureId} no-invention gate`).toBe(
    true,
  );
  expect(report.absenceValid, `${report.fixtureId} absence gate`).toBe(true);
  expect(report.accepted, `${report.fixtureId} acceptance gate`).toBe(true);
  expect(report.violations, `${report.fixtureId} violations`).toEqual([]);
}

describe("T170 semantic parser evaluation", () => {
  const deterministicProvider = createDeterministicSemanticParserProvider();

  it("records a perfect provider-independent deterministic baseline across the T169 corpus", () => {
    const reports = semanticParserFixtures.map((fixture) =>
      evaluateFixture(fixture, fixture.expectedResponse),
    );
    for (const report of reports) expectBaselineInvariants(report);

    const global = aggregate(reports);
    expect(global.inventedFieldCount).toBe(0);
    expect(global.schemaValid).toBe(true);
    expect(global.evidenceValid).toBe(true);
    expect(global.noInventionValid).toBe(true);
    expect(global.absenceValid).toBe(true);
    expect(global.accepted).toBe(true);
    expect(global.exactMatch).toBe(true);

    printBaselineReport(reports);
  });

  it("measures deterministic-provider latency and fact-level agreement on supported fixtures", async () => {
    const supportedIds = new Set<SemanticParserFixtureId>([
      "pdf-english-anonymous",
      "docx-english-anonymous",
    ]);
    const supported = semanticParserFixtures.filter((fixture) =>
      supportedIds.has(fixture.id),
    );
    expect(supported.length).toBeGreaterThan(0);
    const reports: EvaluationReport[] = [];
    for (const fixture of supported) {
      const request = buildSemanticParserFixtureRequest(fixture.id);
      const started = performance.now();
      const result = await deterministicProvider.parse(request);
      const latencyMs = performance.now() - started;
      expect(result.ok, `${fixture.id} provider parse`).toBe(true);
      if (!result.ok) continue;
      const report = evaluateFixture(fixture, result.response, {
        latencyMs,
        providerOk: true,
        providerErrorCode: null,
      });
      expectBaselineInvariants(report);
      expect(report.latencyMs).not.toBeNull();
      expect(report.latencyMs!).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(report.latencyMs!)).toBe(true);
      expect(report.exactMatch, `${fixture.id} exact match`).toBe(true);

      const returnedFacts = collectFacts(result.response);
      const expectedFacts = collectFacts(fixture.expectedResponse);
      const expectedById = new Map(
        expectedFacts.map((fact) => [fact.id, fact.value]),
      );
      expect(returnedFacts.length, `${fixture.id} fact count`).toBe(
        expectedFacts.length,
      );
      for (const fact of returnedFacts) {
        const expected = expectedById.get(fact.id);
        expect(expected, `${fixture.id} fact ${fact.id}`).toBeDefined();
        if (expected === undefined) continue;
        expect(
          valuesEquivalent(fact.value.value, expected.value),
          `${fixture.id} fact ${fact.id} value`,
        ).toBe(true);
      }
      reports.push(report);
    }
    const latencyValues = reports
      .map((report) => report.latencyMs)
      .filter((value): value is number => value !== null);
    console.log(
      `\n[provider-independent deterministic baseline only] deterministic provider latency (supported fixtures): mean ${mean(latencyValues).toFixed(2)}ms over ${latencyValues.length} fixture(s), per-fixture ${latencyValues.map((value) => value.toFixed(2)).join(", ")}ms`,
    );
  });

  it("documents explicit provider failure behavior for unsupported fixture profiles", async () => {
    const supportedIds = new Set<SemanticParserFixtureId>([
      "pdf-english-anonymous",
      "docx-english-anonymous",
    ]);
    const unsupported = semanticParserFixtures.filter(
      (fixture) => !supportedIds.has(fixture.id),
    );
    expect(unsupported.length).toBeGreaterThan(0);
    const failures: ProviderRunReport[] = [];
    for (const fixture of unsupported) {
      const run = await runProviderEvaluation(fixture, deterministicProvider);
      expect(run.kind, `${fixture.id} must fail explicitly`).toBe(
        "provider_error",
      );
      if (run.kind === "provider_error") {
        expect(run.code, `${fixture.id} provider error code`).toBe(
          "unsupported_capability",
        );
        expect(run.retryable, `${fixture.id} retryable`).toBe(false);
        expect(run.latencyMs).toBeGreaterThanOrEqual(0);
        failures.push(run);
      }
    }
    console.log(
      `\n[provider-independent deterministic baseline only] deterministic provider failure behavior: ${failures.length} unsupported fixture(s) failed explicitly with unsupported_capability and no silent success.`,
    );
  });

  it("reports provider errors without fabricating success metrics", async () => {
    const fixture = pdfEnglishFixture();
    const unavailable = await runProviderEvaluation(
      fixture,
      failingProvider("provider_unavailable"),
    );
    expect(unavailable.kind).toBe("provider_error");
    if (unavailable.kind === "provider_error") {
      expect(unavailable.code).toBe("provider_unavailable");
      expect(unavailable.retryable).toBe(true);
    }

    const throwing = await runProviderEvaluation(fixture, throwingProvider());
    expect(throwing.kind).toBe("provider_error");
    if (throwing.kind === "provider_error") {
      expect(throwing.code).toBe("unknown_provider_failure");
      expect(throwing.retryable).toBe(true);
    }
  });

  it("fails closed on invented fields, invalid evidence, schema violations, grouping regressions, and silent success", () => {
    const fixture = pdfEnglishFixture();

    const invented = structuredClone(fixture.expectedResponse);
    if (invented.sections.contact.fullName === null)
      throw new Error("missing name");
    invented.sections.contact.fullName = {
      ...invented.sections.contact.fullName,
      value: "Invented Person Name",
    };
    const inventedReport = evaluateFixture(fixture, invented);
    expect(inventedReport.inventedFieldRate).toBeGreaterThan(0);
    expect(inventedReport.inventedFieldCount).toBeGreaterThan(0);
    expect(inventedReport.noInventionValid).toBe(false);
    expect(inventedReport.accepted).toBe(false);
    expect(
      inventedReport.violations.some((violation) =>
        violation.includes("no_invention"),
      ),
    ).toBe(true);

    const invalidEvidence = structuredClone(fixture.expectedResponse);
    const fragment = fixture.fragments[0];
    if (
      invalidEvidence.sections.contact.fullName === null ||
      fragment === undefined
    )
      throw new Error("missing name or fragment");
    invalidEvidence.sections.contact.fullName = {
      ...invalidEvidence.sections.contact.fullName,
      evidence: [
        {
          line: fragment.line,
          start: fragment.text.length + 5,
          end: fragment.text.length + 12,
          fragmentHash: fragment.hash,
          fragmentId: "fragment-1",
        },
      ],
    };
    const evidenceReport = evaluateFixture(fixture, invalidEvidence);
    expect(evidenceReport.validEvidenceRate).toBeLessThan(1);
    expect(evidenceReport.evidenceValid).toBe(false);
    expect(evidenceReport.accepted).toBe(false);
    expect(
      evidenceReport.violations.some((violation) =>
        violation.includes("evidence"),
      ),
    ).toBe(true);

    const schemaViolation = structuredClone(fixture.expectedResponse);
    Reflect.deleteProperty(schemaViolation.sections.contact, "email");
    const schemaReport = evaluateFixture(fixture, schemaViolation);
    expect(schemaReport.schemaValid).toBe(false);
    expect(schemaReport.accepted).toBe(false);
    expect(
      schemaReport.violations.some((violation) => violation.includes("schema")),
    ).toBe(true);

    const groupingRegression = structuredClone(fixture.expectedResponse);
    const secondRelationship = groupingRegression.relationships.find(
      (relationship) => relationship.candidateId === "relationship-2",
    );
    if (secondRelationship === undefined)
      throw new Error("missing relationship-2");
    secondRelationship.toCandidateId = "work-999";
    const groupingReport = evaluateFixture(fixture, groupingRegression);
    expect(groupingReport.groupingAccuracy).toBeLessThan(1);
    expect(groupingReport.correctGroupingCount).toBeLessThan(
      groupingReport.expectedGroupingCount,
    );

    const silentSuccess = {
      ...fixture.expectedResponse,
      sections: undefined,
    };
    const silentReport = evaluateFixture(
      fixture,
      silentSuccess as unknown as NuvitaeSemanticExtractionResponse,
    );
    expect(silentReport.schemaValid).toBe(false);
    expect(silentReport.accepted).toBe(false);
  });
});

function pdfEnglishFixture(): SemanticParserFixture {
  const fixture = semanticParserFixtures.find(
    (candidate) => candidate.id === "pdf-english-anonymous",
  );
  if (fixture === undefined) throw new Error("Missing PDF English fixture.");
  return fixture;
}

function failingProvider(
  code: SemanticProviderErrorCode,
): ResumeSemanticParserProvider {
  return {
    providerKind: "controlled-failing-evaluation",
    capabilities: createDeterministicSemanticParserProvider().capabilities,
    async inspectConnection() {
      return {
        connectionState: "connected",
        availabilityState: "unavailable",
        checkedAt: new Date(),
        safeMessage: null,
      };
    },
    async parse() {
      return { ok: false, error: createPrivacySafeSemanticProviderError(code) };
    },
  };
}

function throwingProvider(): ResumeSemanticParserProvider {
  return {
    providerKind: "controlled-throwing-evaluation",
    capabilities: createDeterministicSemanticParserProvider().capabilities,
    async inspectConnection() {
      return {
        connectionState: "connected",
        availabilityState: "available",
        checkedAt: new Date(),
        safeMessage: null,
      };
    },
    async parse() {
      throw new Error("controlled provider crash");
    },
  };
}
