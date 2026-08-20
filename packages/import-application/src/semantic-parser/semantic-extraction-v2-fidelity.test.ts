import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildExtractionDraft,
  mapReviewedImportDraftToStructuredResume,
} from "@nuvitae/domain";

import { canonicalizeSemanticExtractionV2 } from "./semantic-extraction-v2-canonicalizer.js";
import { mapSemanticV2CandidatesToDraft } from "./semantic-v2-candidates-to-draft.js";
import { createSourceRegistry } from "./source-registry.js";

const source = readFileSync(
  new URL(
    "../../../../tests/fixtures/resumes/anonymous-realistic-senior-engineer-resume.txt",
    import.meta.url,
  ),
  "utf8",
);
const lines = source
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);
const lineIndex = (text: string): number => {
  const index = lines.findIndex((line) => line.includes(text));
  if (index < 0) throw new Error(`fixture line missing: ${text}`);
  return index;
};
const fragmentId = (index: number) => `fragment-${index + 1}`;
const atom = (text: string, lineText = text) => {
  const index = lineIndex(lineText);
  return {
    value: text,
    sourceRefs: [{ fragmentId: fragmentId(index), quote: text }],
  };
};
const sourceRegistry = createSourceRegistry(
  lines.map((text, order) => ({
    order,
    line: order + 1,
    text,
    ...(/^(?:I build dependable|I lead complex migrations)/u.test(text)
      ? { continuationToNext: "space" as const }
      : {}),
  })),
);

function role(input: {
  readonly line: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly bullets: readonly string[];
}) {
  return {
    title: atom(input.title, input.line),
    location: null,
    startDate: atom(input.start, input.line),
    endDate: atom(input.end, input.line),
    responsibilities: input.bullets.slice(0, 1).map((value) => atom(value)),
    achievements: input.bullets.slice(1).map((value) => atom(value)),
  };
}

function experience(input: {
  readonly employer: string;
  readonly location: string;
  readonly roles: readonly ReturnType<typeof role>[];
}) {
  const line = lines.find((value) => value.startsWith(input.employer));
  if (line === undefined) throw new Error("fixture employer line missing");
  return {
    employerName: atom(input.employer, line),
    employerLocation: atom(input.location, line),
    roles: input.roles,
  };
}

function realisticResponse() {
  const summaryLines = [
    "I build dependable platform systems and help teams ship safely at scale.",
    "I lead complex migrations from discovery through measurable operational results.",
    "I care about accessible products, resilient services, and clear technical ownership.",
  ];
  return {
    schemaVersion: "nuvitae.semantic-extraction.v2" as const,
    sections: {
      contact: {
        fullName: atom("ANONYMOUS CANDIDATE"),
        email: atom("candidate@example.test"),
        phone: atom("+33 6 00 00 00 00"),
        location: atom("Paris, France"),
        website: null,
      },
      headline: atom("Principal Platform Engineer"),
      summary: {
        value: summaryLines.join(" "),
        sourceRefs: summaryLines.map((quote) => ({
          fragmentId: fragmentId(lineIndex(quote)),
          quote,
        })),
      },
      workExperience: [
        experience({
          employer: "Northstar Systems",
          location: "Paris, France",
          roles: [
            role({
              line: "Principal Platform Engineer | 03/2022 - Present",
              title: "Principal Platform Engineer",
              start: "03/2022",
              end: "Present",
              bullets: [
                "Designed a multi-region platform used by product teams across three continents.",
                "Built an internal delivery framework that reduced deployment risk and recovery time.",
              ],
            }),
            role({
              line: "Staff Platform Engineer | 2020-02 - 2022",
              title: "Staff Platform Engineer",
              start: "2020-02",
              end: "2022",
              bullets: [
                "Led the migration from legacy services to independently deployable workloads.",
                "Mentored engineers through architecture reviews and incident response practice.",
              ],
            }),
          ],
        }),
        experience({
          employer: "Vector Analytics",
          location: "Lyon, France",
          roles: [
            role({
              line: "Senior Backend Engineer | 2018 - 2020-01",
              title: "Senior Backend Engineer",
              start: "2018",
              end: "2020-01",
              bullets: [
                "Implemented event-driven data services with clear ownership and observability.",
                "Improved batch processing reliability while keeping customer-facing APIs stable.",
              ],
            }),
          ],
        }),
        experience({
          employer: "Harbor Labs",
          location: "Remote",
          roles: [
            role({
              line: "Backend Engineer | January 2016 - 2018",
              title: "Backend Engineer",
              start: "January 2016",
              end: "2018",
              bullets: [
                "Delivered secure APIs and maintained service contracts across several teams.",
                "Introduced automated testing that shortened the feedback loop for every release.",
              ],
            }),
          ],
        }),
        experience({
          employer: "Signal Works",
          location: "Bordeaux, France",
          roles: [
            role({
              line: "Software Engineer | 2014 - 2016",
              title: "Software Engineer",
              start: "2014",
              end: "2016",
              bullets: [
                "Built service integrations and developer tools for a growing engineering team.",
                "Documented operational practices so new contributors could work independently.",
              ],
            }),
          ],
        }),
      ],
      education: [
        education(
          "MSc Computer Science",
          "Institut Technique",
          "Paris",
          "2013",
          "2015",
        ),
        education(
          "BSc Software Engineering",
          "Example University",
          "Lyon",
          "2010",
          "2013",
        ),
        education(
          "Exchange Diploma in Distributed Systems",
          "Northern Institute",
          "Helsinki",
          "2009",
          "2010",
        ),
      ],
      skills: [
        "TypeScript",
        "Go",
        "Python",
        "PostgreSQL",
        "Kubernetes",
        "AWS",
        "Terraform",
        "Docker",
      ].map((name) => ({ name: atom(name) })),
      languages: [
        ["English", "Fluent"],
        ["French", "Professional"],
        ["German", "Conversational"],
      ].map(([name, proficiency]) => ({
        name: atom(name),
        proficiency: atom(proficiency),
      })),
      projects: [],
      certifications: [
        certification("Cloud Architecture Professional", "Example Board"),
        certification("Kubernetes Administrator", "Example Foundation"),
      ],
      professionalLinks: [
        atom("https://linkedin.example.test/anonymous"),
        atom("https://github.example.test/anonymous"),
        atom("https://portfolio.example.test/anonymous"),
      ],
    },
    relationships: [],
    ambiguities: [],
    conflicts: [],
  };
}

function education(
  degree: string,
  institution: string,
  location: string,
  start: string,
  end: string,
) {
  const line = lines.find((value) => value.startsWith(degree));
  if (line === undefined) throw new Error("fixture education line missing");
  return {
    institution: atom(institution, line),
    degree: atom(degree, line),
    fieldOfStudy: null,
    startDate: atom(start, line),
    endDate: atom(end, line),
    location: atom(location, line),
  };
}

function certification(name: string, issuer: string) {
  const line = lines.find((value) => value.startsWith(name));
  if (line === undefined) throw new Error("fixture certification line missing");
  return { name: atom(name, line), issuer: atom(issuer, line) };
}

function compactProviderResponse(
  input: ReturnType<typeof realisticResponse>,
): unknown {
  const compact = structuredClone(input) as {
    sections: Record<string, unknown>;
    [key: string]: unknown;
  };
  const sections = compact.sections;
  const contact = sections.contact as Record<string, unknown>;
  for (const key of ["fullName", "email", "phone", "location", "website"]) {
    if (contact[key] === null) delete contact[key];
  }
  for (const key of ["headline", "summary"]) {
    if (sections[key] === null) delete sections[key];
  }
  for (const key of [
    "workExperience",
    "education",
    "skills",
    "languages",
    "projects",
    "certifications",
    "professionalLinks",
  ]) {
    if (Array.isArray(sections[key]) && sections[key].length === 0)
      delete sections[key];
  }
  const workExperience = sections.workExperience as Array<
    Record<string, unknown>
  >;
  for (const work of workExperience) {
    if (work.employerLocation === null) delete work.employerLocation;
    const roles = work.roles as Array<Record<string, unknown>>;
    for (const role of roles) {
      for (const key of ["location", "startDate", "endDate"]) {
        if (role[key] === null) delete role[key];
      }
      for (const key of ["responsibilities", "achievements"]) {
        if (Array.isArray(role[key]) && role[key].length === 0)
          delete role[key];
      }
    }
  }
  const education = sections.education as Array<Record<string, unknown>>;
  for (const item of education) {
    for (const key of [
      "degree",
      "fieldOfStudy",
      "startDate",
      "endDate",
      "location",
    ]) {
      if (item[key] === null) delete item[key];
    }
  }
  const languages = sections.languages as Array<Record<string, unknown>>;
  for (const item of languages) {
    if (item.proficiency === null) delete item.proficiency;
  }
  const certifications = sections.certifications as Array<
    Record<string, unknown>
  >;
  for (const item of certifications) {
    if (item.issuer === null) delete item.issuer;
  }
  for (const key of ["relationships", "ambiguities", "conflicts"]) {
    if (Array.isArray(compact[key]) && compact[key].length === 0)
      delete compact[key];
  }
  return compact;
}

function document() {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    ownerUserId: "10000000-0000-4000-8000-000000000002",
    visibleFilename: "anonymous-realistic-resume.txt",
    contentType: "text/plain",
    fileExtension: "pdf" as const,
    sizeBytes: 12_000,
    renderedPageCount: 2,
    detectedLanguage: "english" as const,
    uploadStatus: "stored" as const,
    validationStatus: "accepted" as const,
    processingStatus: "semantic_parsing_running" as const,
    deletionStatus: "retained" as const,
    createdAt: new Date("2026-08-11T10:00:00.000Z"),
    retentionExpiresAt: new Date("2026-08-18T10:00:00.000Z"),
  };
}

describe("semantic-extraction.v2 realistic source fidelity", () => {
  it("audits every supported section without silent loss or invented groups", () => {
    const canonical = canonicalizeSemanticExtractionV2({
      response: realisticResponse(),
      sourceRegistry,
      importId: document().id,
    });
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;

    const mapped = mapSemanticV2CandidatesToDraft({
      candidates: canonical.candidates,
      rejected: canonical.rejected,
      signals: canonical.signals,
      document: document(),
    });

    const sectionFieldCounts = Object.fromEntries(
      [
        "contact",
        "headline",
        "summary",
        "work_experience",
        "education",
        "skills",
        "languages",
        "projects",
        "certifications",
        "professional_links",
      ].map((section) => [
        section,
        mapped.fields.filter((field) => field.section === section).length,
      ]),
    );
    expect(sectionFieldCounts).toEqual({
      contact: 4,
      headline: 1,
      summary: 1,
      work_experience: 28,
      education: 15,
      skills: 8,
      languages: 6,
      projects: 0,
      certifications: 4,
      professional_links: 3,
    });
    expect(mapped.fields).toHaveLength(70);
    expect(mapped.warnings).toHaveLength(11);
    expect(mapped.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          warningType: "ambiguous",
          fieldPath: "summary",
        }),
      ]),
    );
    expect(canonical.rejected).toEqual([]);
    expect(canonical.signals).toEqual([]);

    const summary = canonical.candidates.find(
      (candidate) => candidate.fieldPath === "summary",
    );
    expect(summary?.value).toBe(
      [
        "I build dependable platform systems and help teams ship safely at scale.",
        "I lead complex migrations from discovery through measurable operational results.",
        "I care about accessible products, resilient services, and clear technical ownership.",
      ].join(" "),
    );
    expect(summary?.evidence).toHaveLength(3);
    expect(
      mapped.fields.filter((field) => field.section === "projects"),
    ).toEqual([]);

    const draftResult = buildExtractionDraft({
      importedDocument: document(),
      fields: mapped.fields,
      warnings: mapped.warnings,
      missingOrUnprocessedSections: [],
      ids: {
        draftId: () => "20000000-0000-4000-8000-000000000002",
        fieldId: (() => {
          let next = 100;
          return () =>
            `20000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
        warningId: (() => {
          let next = 100;
          return () =>
            `20000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
      },
      now: new Date("2026-08-11T10:01:00.000Z"),
    });
    expect(draftResult.category).toBe("complete");
    expect(draftResult.draft?.fields).toHaveLength(70);
    expect(draftResult.draft?.warnings).toHaveLength(11);
    expect(
      draftResult.draft?.fields.filter((field) => field.section === "projects"),
    ).toEqual([]);
  });

  it("preserves complete long-form and grouped content through review and confirmation", () => {
    const response = realisticResponse();
    const canonical = canonicalizeSemanticExtractionV2({
      response,
      sourceRegistry,
      importId: document().id,
    });
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;
    expect(canonical.rejected).toEqual([]);

    const summary = canonical.candidates.find(
      (item) => item.fieldPath === "summary",
    );
    expect(summary?.value).toBe(
      "I build dependable platform systems and help teams ship safely at scale. I lead complex migrations from discovery through measurable operational results. I care about accessible products, resilient services, and clear technical ownership.",
    );
    expect(summary?.evidence.map((item) => item.fragmentId)).toHaveLength(3);
    expect(
      canonical.candidates.filter(
        (item) =>
          item.fieldPath.includes("responsibilities") ||
          item.fieldPath.includes("achievements"),
      ),
    ).toHaveLength(10);

    const mapped = mapSemanticV2CandidatesToDraft({
      candidates: canonical.candidates,
      rejected: canonical.rejected,
      signals: canonical.signals,
      document: document(),
    });
    const compactCanonical = canonicalizeSemanticExtractionV2({
      response: compactProviderResponse(response),
      sourceRegistry,
      importId: document().id,
    });
    expect(compactCanonical).toEqual(canonical);
    if (!compactCanonical.ok) return;
    expect(
      mapSemanticV2CandidatesToDraft({
        candidates: compactCanonical.candidates,
        rejected: compactCanonical.rejected,
        signals: compactCanonical.signals,
        document: document(),
      }),
    ).toEqual(mapped);
    expect(mapped.warnings).toHaveLength(11);
    const draftResult = buildExtractionDraft({
      importedDocument: document(),
      fields: mapped.fields,
      warnings: mapped.warnings,
      missingOrUnprocessedSections: [],
      ids: {
        draftId: () => "20000000-0000-4000-8000-000000000001",
        fieldId: (() => {
          let next = 10;
          return () =>
            `20000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
        warningId: (() => {
          let next = 200;
          return () =>
            `20000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
      },
      now: new Date("2026-08-11T10:01:00.000Z"),
    });
    expect(draftResult.category).toBe("complete");
    expect(draftResult.draft).toBeDefined();
    if (draftResult.draft === undefined) return;
    expect(
      draftResult.draft.fields.find((item) => item.fieldPath === "summary")
        ?.value,
    ).toEqual({
      kind: "text",
      value: summary?.value,
    });
    expect(
      draftResult.draft.fields.filter(
        (item) => item.section === "professional_links",
      ),
    ).toHaveLength(3);
    expect(
      draftResult.draft.fields.filter(
        (item) =>
          item.section === "work_experience" &&
          item.fieldPath.endsWith(".date_range"),
      ),
    ).toHaveLength(5);

    const confirmedDraft = {
      ...draftResult.draft,
      status: "ready_to_confirm" as const,
      fields: draftResult.draft.fields.map((field) => ({
        ...field,
        reviewStatus: "confirmed" as const,
        inferenceStatus:
          field.inferenceStatus === "inferred_needs_review"
            ? ("confirmed_inference" as const)
            : field.inferenceStatus,
      })),
      warnings: draftResult.draft.warnings.map((warning) => ({
        ...warning,
        reviewStatus: "confirmed" as const,
        resolvedAt: new Date("2026-08-11T10:02:00.000Z"),
      })),
    };
    const confirmed = mapReviewedImportDraftToStructuredResume({
      draft: confirmedDraft,
      corrections: [],
      structuredResumeId: "30000000-0000-4000-8000-000000000001",
      childIds: {
        textItemId: () => "30000000-0000-4000-8000-000000000010",
        workExperienceId: (() => {
          let next = 20;
          return () =>
            `30000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
        workRoleId: (() => {
          let next = 30;
          return () =>
            `30000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
        sectionItemId: (() => {
          let next = 40;
          return () =>
            `30000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
        linkId: (() => {
          let next = 60;
          return () =>
            `30000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
      },
      confirmedAt: new Date("2026-08-11T10:02:00.000Z"),
      now: new Date("2026-08-11T10:02:00.000Z"),
    });
    if (!confirmed.ok) {
      throw new Error(
        confirmed.blockers
          .map(
            (blocker) =>
              `${blocker.code}:${blocker.section ?? ""}:${blocker.fieldLabel ?? ""}`,
          )
          .join(","),
      );
    }
    expect(confirmed.resume.content.summary?.value).toBe(summary?.value);
    expect(confirmed.resume.content.workExperiences).toHaveLength(4);
    expect(
      confirmed.resume.content.workExperiences.flatMap((item) => item.roles),
    ).toHaveLength(5);
    expect(confirmed.resume.content.education).toHaveLength(3);
    expect(confirmed.resume.content.skills).toHaveLength(8);
    expect(confirmed.resume.content.languages).toHaveLength(3);
    expect(confirmed.resume.content.professionalLinks).toHaveLength(3);
    expect(confirmed.resume.content.certifications).toHaveLength(2);
    expect(confirmed.resume.content.projects).toHaveLength(0);
    expect(
      confirmed.resume.content.workExperiences[0]?.roles[0]?.startDate,
    ).toMatchObject({
      year: 2022,
      month: 3,
      precision: "month",
    });
    expect(
      confirmed.resume.content.workExperiences[0]?.roles[0]?.endDate,
    ).toMatchObject({
      precision: "present",
      originalText: "Present",
    });
  });
});
