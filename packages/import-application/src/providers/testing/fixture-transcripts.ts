import { createHash } from "node:crypto";

import {
  nuvitaeSemanticExtractionResponseVersion,
  resumeSemanticParserContractVersion,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
  type SemanticDocumentFormat,
  type SemanticEvidence,
  type SemanticValue,
} from "@nuvitae/contracts";

/**
 * Anonymous normalized fixture transcripts consumed by the deterministic
 * semantic-provider test adapter.
 *
 * These are content fixtures only: normalized transcript lines plus the
 * canonical flattened source fragments a provider receives in a
 * `ResumeSemanticParseRequest`. No binary PDF/DOCX file is read here, no
 * storage/network/credentials are touched, and every name, address, employer,
 * and project in these fixtures is fictional and anonymous.
 */

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export type DeterministicFixtureProfileId =
  "pdf-english-anonymous" | "docx-english-anonymous";

export type DeterministicSourceFragment =
  ResumeSemanticParseRequest["sourceFragments"][number];

export interface DeterministicFixtureProfile {
  readonly profileId: DeterministicFixtureProfileId;
  readonly documentFormat: SemanticDocumentFormat;
  readonly detectedLanguage: "english";
  readonly transcript: ResumeSemanticParseRequest["normalizedTranscript"];
  readonly fragments: readonly DeterministicSourceFragment[];
  readonly fragmentHashes: readonly string[];
  readonly formatMetadata: ResumeSemanticParseRequest["formatMetadata"];
  readonly response: NuvitaeSemanticExtractionResponse;
}

function buildFragments(
  lines: readonly string[],
): readonly DeterministicSourceFragment[] {
  return lines.map((line, index) => {
    const text = normalizeText(line);
    if (text.length === 0) {
      throw new Error(`Fixture fragment ${index} must not be empty.`);
    }
    return {
      order: index,
      line: index + 1,
      text,
      hash: sha256(text),
      bounds: {
        lineStart: index + 1,
        lineEnd: index + 1,
        start: 0,
        end: text.length,
      },
    };
  });
}

function fragmentAt(
  fragments: readonly DeterministicSourceFragment[],
  index: number,
): DeterministicSourceFragment {
  const fragment = fragments[index];
  if (!fragment) throw new Error(`Fixture fragment ${index} is missing.`);
  return fragment;
}

function evidenceOf(
  fragment: DeterministicSourceFragment,
  value: string,
): SemanticEvidence {
  const start = fragment.text.indexOf(value);
  if (start === -1) {
    throw new Error(
      `Fixture value "${value}" was not found in fragment ${fragment.order + 1}.`,
    );
  }
  const end = start + value.length;
  if (fragment.text.indexOf(value, end) !== -1) {
    throw new Error(
      `Fixture value "${value}" is not unique in fragment ${fragment.order + 1}.`,
    );
  }
  return {
    line: fragment.line,
    start,
    end,
    fragmentHash: fragment.hash,
    fragmentId: `fragment-${fragment.order + 1}`,
  };
}

function semanticValueOf(
  fragment: DeterministicSourceFragment,
  value: string,
): SemanticValue {
  return {
    value,
    normalizedValue: null,
    evidence: [evidenceOf(fragment, value)],
    classification: "explicit",
    confidence: "high",
  };
}

function makeProfile(options: {
  readonly profileId: DeterministicFixtureProfileId;
  readonly documentFormat: SemanticDocumentFormat;
  readonly lines: readonly string[];
  readonly buildResponse: (
    fragments: readonly DeterministicSourceFragment[],
  ) => NuvitaeSemanticExtractionResponse;
}): DeterministicFixtureProfile {
  const fragments = buildFragments(options.lines);
  const transcriptText = fragments.map((fragment) => fragment.text).join("\n");
  return {
    profileId: options.profileId,
    documentFormat: options.documentFormat,
    detectedLanguage: "english",
    transcript: {
      text: transcriptText,
      sha256: sha256(transcriptText),
      lineCount: fragments.length,
    },
    fragments,
    fragmentHashes: fragments.map((fragment) => fragment.hash),
    formatMetadata: {
      sourceFormat: options.documentFormat,
      extractionMode: "selectable_text",
      renderedPageCount: 1,
      parserVersion: null,
    },
    response: options.buildResponse(fragments),
  };
}

function buildPdfEnglishResponse(
  fragments: readonly DeterministicSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fragmentAt(fragments, 0);
  const email = fragmentAt(fragments, 1);
  const location = fragmentAt(fragments, 2);
  const phone = fragmentAt(fragments, 3);
  const headline = fragmentAt(fragments, 4);
  const summary = fragmentAt(fragments, 6);
  const employer = fragmentAt(fragments, 8);
  const seniorRole = fragmentAt(fragments, 9);
  const seniorDates = fragmentAt(fragments, 10);
  const seniorResponsibility = fragmentAt(fragments, 11);
  const engineerRole = fragmentAt(fragments, 12);
  const engineerDates = fragmentAt(fragments, 13);
  const engineerResponsibility = fragmentAt(fragments, 14);
  const degree = fragmentAt(fragments, 16);
  const institution = fragmentAt(fragments, 17);
  const educationDates = fragmentAt(fragments, 18);
  const skillsLine = fragmentAt(fragments, 20);
  const languagesLine = fragmentAt(fragments, 22);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [evidenceOf(languagesLine, "English")],
    },
    sections: {
      contact: {
        fullName: semanticValueOf(name, "Jordan Avery"),
        email: semanticValueOf(email, "jordan.avery@example.test"),
        phone: semanticValueOf(phone, "+33 6 12 34 56 78"),
        location: semanticValueOf(location, "Paris, France"),
        website: null,
      },
      headline: semanticValueOf(headline, "Senior Software Engineer"),
      summary: semanticValueOf(
        summary,
        "Backend engineer with six years of experience building distributed systems.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: semanticValueOf(employer, "Nova Systems"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: semanticValueOf(seniorRole, "Senior Software Engineer"),
              location: null,
              startDate: semanticValueOf(seniorDates, "2021"),
              endDate: null,
              isOngoing: true,
              responsibilities: [
                semanticValueOf(
                  seniorResponsibility,
                  "Lead the payments platform team of eight engineers.",
                ),
              ],
              achievements: [],
            },
            {
              candidateId: "role-2",
              title: semanticValueOf(engineerRole, "Software Engineer"),
              location: null,
              startDate: semanticValueOf(engineerDates, "2019"),
              endDate: semanticValueOf(engineerDates, "2021"),
              isOngoing: false,
              responsibilities: [
                semanticValueOf(
                  engineerResponsibility,
                  "Built and operated the customer notification service.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: semanticValueOf(institution, "State University"),
          degree: semanticValueOf(degree, "BSc Computer Science"),
          fieldOfStudy: null,
          startDate: semanticValueOf(educationDates, "2015"),
          endDate: semanticValueOf(educationDates, "2019"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: semanticValueOf(skillsLine, "TypeScript"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: semanticValueOf(skillsLine, "Go"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: semanticValueOf(skillsLine, "PostgreSQL"),
          category: null,
        },
        {
          candidateId: "skill-4",
          name: semanticValueOf(skillsLine, "Kubernetes"),
          category: null,
        },
        {
          candidateId: "skill-5",
          name: semanticValueOf(skillsLine, "AWS"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: semanticValueOf(languagesLine, "English"),
          proficiency: semanticValueOf(languagesLine, "native"),
        },
        {
          candidateId: "language-2",
          name: semanticValueOf(languagesLine, "French"),
          proficiency: semanticValueOf(languagesLine, "fluent"),
        },
      ],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          evidenceOf(employer, "Nova Systems"),
          evidenceOf(seniorRole, "Senior Software Engineer"),
        ],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-2",
        toCandidateId: "work-1",
        evidence: [
          evidenceOf(employer, "Nova Systems"),
          evidenceOf(engineerRole, "Software Engineer"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function buildDocxEnglishResponse(
  fragments: readonly DeterministicSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fragmentAt(fragments, 0);
  const email = fragmentAt(fragments, 1);
  const location = fragmentAt(fragments, 2);
  const headline = fragmentAt(fragments, 3);
  const summary = fragmentAt(fragments, 5);
  const acme = fragmentAt(fragments, 7);
  const designerRole = fragmentAt(fragments, 8);
  const ambiguousDates = fragmentAt(fragments, 9);
  const designerResponsibility = fragmentAt(fragments, 10);
  const bright = fragmentAt(fragments, 11);
  const seniorRole = fragmentAt(fragments, 12);
  const brightDates = fragmentAt(fragments, 13);
  const seniorResponsibility = fragmentAt(fragments, 14);
  const skillsLine = fragmentAt(fragments, 16);
  const languagesLine = fragmentAt(fragments, 18);
  const projectOne = fragmentAt(fragments, 20);
  const projectTwo = fragmentAt(fragments, 21);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [evidenceOf(languagesLine, "English")],
    },
    sections: {
      contact: {
        fullName: semanticValueOf(name, "Maya Chen"),
        email: semanticValueOf(email, "maya.chen@example.test"),
        phone: null,
        location: semanticValueOf(location, "Lyon, France"),
        website: null,
      },
      headline: semanticValueOf(headline, "Product Designer"),
      summary: semanticValueOf(
        summary,
        "Product designer focused on design systems and accessibility.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: semanticValueOf(acme, "Acme Studio"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: semanticValueOf(designerRole, "Product Designer"),
              location: null,
              startDate: semanticValueOf(ambiguousDates, "2019"),
              endDate: null,
              isOngoing: null,
              responsibilities: [
                semanticValueOf(
                  designerResponsibility,
                  "Shipped the design system used by twelve product teams.",
                ),
              ],
              achievements: [],
            },
          ],
        },
        {
          candidateId: "work-2",
          employerName: semanticValueOf(bright, "Bright Labs"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-2",
              title: semanticValueOf(seniorRole, "Senior Product Designer"),
              location: null,
              startDate: semanticValueOf(brightDates, "2022"),
              endDate: null,
              isOngoing: true,
              responsibilities: [
                semanticValueOf(
                  seniorResponsibility,
                  "Lead design reviews and user research for the mobile app.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [],
      skills: [
        {
          candidateId: "skill-1",
          name: semanticValueOf(skillsLine, "Figma"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: semanticValueOf(skillsLine, "Prototyping"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: semanticValueOf(skillsLine, "Design Systems"),
          category: null,
        },
        {
          candidateId: "skill-4",
          name: semanticValueOf(skillsLine, "Accessibility"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: semanticValueOf(languagesLine, "French"),
          proficiency: semanticValueOf(languagesLine, "native"),
        },
        {
          candidateId: "language-2",
          name: semanticValueOf(languagesLine, "English"),
          proficiency: semanticValueOf(languagesLine, "professional"),
        },
      ],
      projects: [
        {
          candidateId: "project-1",
          name: semanticValueOf(
            projectOne,
            "Open-source design tokens library",
          ),
          description: null,
          technologies: [],
          links: [],
        },
        {
          candidateId: "project-2",
          name: semanticValueOf(projectTwo, "Accessibility audit toolkit"),
          description: null,
          technologies: [],
          links: [],
        },
      ],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          evidenceOf(acme, "Acme Studio"),
          evidenceOf(designerRole, "Product Designer"),
        ],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-2",
        toCandidateId: "work-2",
        evidence: [
          evidenceOf(bright, "Bright Labs"),
          evidenceOf(seniorRole, "Senior Product Designer"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [
      {
        code: "ambiguous_date",
        message: "A role end date is ambiguous and requires review.",
        severity: "warning",
        evidence: [evidenceOf(ambiguousDates, "2019/2021")],
        safeDetail: "The end date could be read as a range or a single year.",
      },
    ],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

export const deterministicFixtureProfiles: readonly DeterministicFixtureProfile[] =
  [
    makeProfile({
      profileId: "pdf-english-anonymous",
      documentFormat: "pdf",
      lines: [
        "Jordan Avery",
        "jordan.avery@example.test",
        "Paris, France",
        "+33 6 12 34 56 78",
        "Senior Software Engineer",
        "Summary",
        "Backend engineer with six years of experience building distributed systems.",
        "Work Experience",
        "Nova Systems",
        "Senior Software Engineer",
        "2021 – Present",
        "Lead the payments platform team of eight engineers.",
        "Software Engineer",
        "2019 – 2021",
        "Built and operated the customer notification service.",
        "Education",
        "BSc Computer Science",
        "State University",
        "2015 – 2019",
        "Skills",
        "TypeScript, Go, PostgreSQL, Kubernetes, AWS",
        "Languages",
        "English (native), French (fluent)",
      ],
      buildResponse: buildPdfEnglishResponse,
    }),
    makeProfile({
      profileId: "docx-english-anonymous",
      documentFormat: "docx",
      lines: [
        "Maya Chen",
        "maya.chen@example.test",
        "Lyon, France",
        "Product Designer",
        "Summary",
        "Product designer focused on design systems and accessibility.",
        "Work Experience",
        "Acme Studio",
        "Product Designer",
        "2019/2021",
        "Shipped the design system used by twelve product teams.",
        "Bright Labs",
        "Senior Product Designer",
        "2022 – Present",
        "Lead design reviews and user research for the mobile app.",
        "Skills",
        "Figma, Prototyping, Design Systems, Accessibility",
        "Languages",
        "French (native), English (professional)",
        "Projects",
        "Open-source design tokens library",
        "Accessibility audit toolkit",
      ],
      buildResponse: buildDocxEnglishResponse,
    }),
  ];

export function buildFixtureParseRequest(
  profile: DeterministicFixtureProfile,
  identifiers?: {
    readonly importId?: string;
    readonly correlationId?: string;
  },
): ResumeSemanticParseRequest {
  const correlationId = identifiers?.correlationId ?? null;
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: identifiers?.importId ?? `fixture-${profile.profileId}`,
    correlationId,
    documentFormat: profile.documentFormat,
    languageContext: {
      detectedLanguage: profile.detectedLanguage,
      confidence: "high",
      textDirection: "ltr",
    },
    normalizedTranscript: profile.transcript,
    sourceFragments: profile.fragments.map((fragment) => ({ ...fragment })),
    fragmentHashes: profile.fragmentHashes.map((hash) => hash),
    formatMetadata: profile.formatMetadata,
  };
}
