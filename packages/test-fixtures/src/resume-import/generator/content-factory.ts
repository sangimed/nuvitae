import type {
  ResumeContentProfile,
  ResumeFixtureSpec,
  ResumeSemanticTruth,
} from "./fixture-spec.js";

export interface RenderableResume {
  readonly heading: string;
  readonly contactLine: string;
  readonly sections: readonly {
    readonly heading: string;
    readonly lines: readonly string[];
  }[];
}

export function contentForSpec(spec: ResumeFixtureSpec): RenderableResume {
  const truth = spec.oracle.semantic;
  if (truth === null) {
    return {
      heading: "Synthetic fixture — intentionally invalid",
      contactLine: "fixture@example.test",
      sections: [],
    };
  }
  if (spec.profile === "no_supported_field") {
    return {
      heading: "Community Event Agenda",
      contactLine: "Thursday, 09:00–17:00",
      sections: [
        { heading: "Sessions", lines: ["Welcome", "Lunch", "Closing remarks"] },
      ],
    };
  }
  return renderableFromTruth(truth, spec.profile, spec.language);
}

function renderableFromTruth(
  truth: ResumeSemanticTruth,
  profile: ResumeContentProfile,
  language: ResumeFixtureSpec["language"],
): RenderableResume {
  const french = language === "french";
  const bilingual = language === "bilingual_french_english";
  const unsupported = language === "unsupported";
  const heading = truth.contact.name ?? "Synthetic Candidate";
  const contactLine = [
    truth.contact.email,
    truth.contact.phone,
    truth.contact.location,
    ...truth.contact.links,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" · ");
  const labels = unsupported
    ? [
        "Perfil",
        "Experiencia",
        "Educación",
        "Habilidades",
        "Idiomas",
        "Proyectos",
      ]
    : french
      ? [
          "Profil",
          "Expérience",
          "Formation",
          "Compétences",
          "Langues",
          "Projets",
        ]
      : bilingual
        ? [
            "Profil / Profile",
            "Expérience / Experience",
            "Formation / Education",
            "Compétences / Skills",
            "Langues / Languages",
            "Projets / Projects",
          ]
        : [
            "Profile",
            "Experience",
            "Education",
            "Skills",
            "Languages",
            "Projects",
          ];
  const experience = truth.employers.flatMap((employer, index) => [
    employer,
    truth.roles[index] ?? truth.roles[0] ?? "Role",
    truth.dates[index] ?? truth.dates[0] ?? "Date unavailable",
    ...(index === 0 ? truth.bullets.map((bullet) => `• ${bullet}`) : []),
  ]);
  const sections = [
    {
      heading: labels[0]!,
      lines: [truth.headline, truth.summary].filter(
        (value): value is string => value !== undefined,
      ),
    },
    { heading: labels[1]!, lines: experience },
    { heading: labels[2]!, lines: truth.education },
    { heading: labels[3]!, lines: truth.skills },
    { heading: labels[4]!, lines: truth.languages },
    {
      heading: labels[5]!,
      lines: [...truth.projects, ...truth.certifications],
    },
  ].filter((section) => section.lines.length > 0);
  if (profile === "mixed_separable") {
    sections.push({
      heading: "Appendix — unrelated meeting notes",
      lines: ["Catering estimate: 24", "Room: Example Hall B"],
    });
  }
  if (profile === "mixed_ambiguous") {
    sections.unshift({
      heading: "Two candidate notes combined",
      lines: ["Candidate A", "Candidate B", "Ownership cannot be determined"],
    });
  }
  return { heading, contactLine, sections };
}

export function stressSpec(
  seed: number,
  index: number,
  format: "pdf" | "docx",
) {
  const random = mulberry32(seed + index);
  const layouts =
    format === "pdf"
      ? ([
          "ats_one_column",
          "dense_one_column",
          "two_column",
          "three_column_sidebar",
          "header_footer",
        ] as const)
      : ([
          "ats_one_column",
          "dense_one_column",
          "docx_table",
          "header_footer",
          "reordered_sections",
        ] as const);
  const layout = layouts[Math.floor(random() * layouts.length)]!;
  const fixtureId = `stress-${seed}-${String(index).padStart(4, "0")}-${format}`;
  const truth: ResumeSemanticTruth = {
    contact: {
      name: `Candidate Example ${String(index).padStart(4, "0")}`,
      email: `candidate-${seed}-${index}@example.test`,
      location: `Example City ${Math.floor(random() * 20)}`,
      links: [`https://profiles.example.test/${seed}/${index}`],
    },
    headline: index % 2 === 0 ? "Software Engineer" : "Product Analyst",
    summary:
      "Fictional seeded profile generated for deterministic stress testing.",
    employers: [`Example Organization ${Math.floor(random() * 50)}`],
    roles: [index % 2 === 0 ? "Software Engineer" : "Product Analyst"],
    dates: [`${2015 + Math.floor(random() * 7)} – Present`],
    bullets: [
      `Improved synthetic metric by ${10 + Math.floor(random() * 80)}%.`,
    ],
    education: ["Example University — 2018"],
    skills: ["TypeScript", "SQL", index % 3 === 0 ? "Python" : "Research"],
    languages: ["English (fluent)"],
    certifications: [],
    projects: [],
  };
  return {
    fixtureId,
    seed: seed + index,
    format,
    language: "english" as const,
    layout,
    profile: "complete" as const,
    complexity: "intermediate" as const,
    mutation: "none" as const,
    rendererVersion: "nuvitae-resume-fixtures-v1" as const,
    outputPath: `packages/test-fixtures/resume-import/stress/${fixtureId}.${format}`,
    oracle: {
      fixtureId,
      semantic: truth,
      expectedWarnings: [],
      expectedEligibility: "eligible" as const,
      provenance: { sourceLocationRequired: true },
    },
  } satisfies ResumeFixtureSpec;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
