import { createHash } from "node:crypto";

import {
  resumeSemanticParserContractVersion,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
  type SemanticDocumentFormat,
  type SemanticEvidence,
  type SemanticValue,
} from "@nuvitae/contracts";
import {
  deterministicFixtureProfiles,
  type DeterministicFixtureProfile,
} from "@nuvitae/import-application/testing";

/**
 * Realistic anonymous semantic-parser fixture corpus.
 *
 * These are content fixtures only: normalized transcript lines plus the
 * canonical flattened source fragments a provider receives in a
 * `ResumeSemanticParseRequest`. No binary PDF/DOCX file is read here and no
 * storage, network, credential, or provider SDK is touched. Every name,
 * address, employer, institution, certification, and project is fictional
 * and anonymous; every non-test domain uses `example.test`.
 *
 * The two English single-column fixtures (`pdf-english-anonymous` and
 * `docx-english-anonymous`) are the existing T210 deterministic-provider
 * profiles, reused verbatim so the corpus never defines a conflicting copy.
 * The remaining fixtures extend the matrix to French, bilingual, and
 * multi-column coverage while keeping stable, deterministic fixture IDs.
 */

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeFixtureText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export type SemanticParserFixtureId =
  | "pdf-english-anonymous"
  | "docx-english-anonymous"
  | "pdf-french-anonymous"
  | "pdf-french-canonical-anonymous"
  | "docx-french-anonymous"
  | "pdf-bilingual-anonymous"
  | "docx-bilingual-anonymous"
  | "pdf-english-multi-column-anonymous"
  | "docx-french-multi-column-anonymous";

export type SemanticParserFixtureLanguage =
  "english" | "french" | "bilingual_french_english";

export type SemanticParserFixtureLayout = "single_column" | "multi_column";

export type SemanticParserFixtureFormat = SemanticDocumentFormat;

export interface SemanticParserFixtureInput {
  readonly id: SemanticParserFixtureId;
  readonly format: SemanticParserFixtureFormat;
  readonly language: SemanticParserFixtureLanguage;
  readonly layout: SemanticParserFixtureLayout;
  readonly transcript: ResumeSemanticParseRequest["normalizedTranscript"];
  readonly fragments: readonly ResumeSemanticParseRequest["sourceFragments"][number][];
  readonly fragmentHashes: readonly string[];
  readonly formatMetadata: ResumeSemanticParseRequest["formatMetadata"];
}

export type SemanticParserSourceFragment =
  ResumeSemanticParseRequest["sourceFragments"][number];

export function buildFixtureFragments(
  lines: readonly string[],
): readonly SemanticParserSourceFragment[] {
  return lines.map((line, index) => {
    const text = normalizeFixtureText(line);
    if (text.length === 0) {
      throw new Error(`Semantic fixture fragment ${index} must not be empty.`);
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

export function fixtureFragmentAt(
  fragments: readonly SemanticParserSourceFragment[],
  index: number,
): SemanticParserSourceFragment {
  const fragment = fragments[index];
  if (fragment === undefined) {
    throw new Error(`Semantic fixture fragment ${index} is missing.`);
  }
  return fragment;
}

export function fixtureEvidenceOf(
  fragment: SemanticParserSourceFragment,
  value: string,
): SemanticEvidence {
  const start = fragment.text.indexOf(value);
  if (start === -1) {
    throw new Error(
      `Semantic fixture value "${value}" was not found in fragment ${fragment.order + 1}.`,
    );
  }
  const end = start + value.length;
  if (fragment.text.indexOf(value, end) !== -1) {
    throw new Error(
      `Semantic fixture value "${value}" is not unique in fragment ${fragment.order + 1}.`,
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

export function fixtureSemanticValueOf(
  fragment: SemanticParserSourceFragment,
  value: string,
  options?: {
    readonly classification?: "explicit" | "inferred";
    readonly confidence?: "high" | "medium" | "low";
  },
): SemanticValue {
  return {
    value,
    normalizedValue: null,
    evidence: [fixtureEvidenceOf(fragment, value)],
    classification: options?.classification ?? "explicit",
    confidence: options?.confidence ?? "high",
  };
}

function fromT210Profile(
  profile: DeterministicFixtureProfile,
): SemanticParserFixtureInput {
  return {
    id: profile.profileId as SemanticParserFixtureId,
    format: profile.documentFormat,
    language: profile.detectedLanguage,
    layout: "single_column",
    transcript: profile.transcript,
    fragments: profile.fragments.map((fragment) => ({ ...fragment })),
    fragmentHashes: [...profile.fragmentHashes],
    formatMetadata: profile.formatMetadata,
  };
}

function fromLines(options: {
  readonly id: SemanticParserFixtureId;
  readonly format: SemanticParserFixtureFormat;
  readonly language: SemanticParserFixtureLanguage;
  readonly layout: SemanticParserFixtureLayout;
  readonly lines: readonly string[];
}): SemanticParserFixtureInput {
  const fragments = buildFixtureFragments(options.lines);
  const transcriptText = fragments.map((fragment) => fragment.text).join("\n");
  return {
    id: options.id,
    format: options.format,
    language: options.language,
    layout: options.layout,
    transcript: {
      text: transcriptText,
      sha256: sha256(transcriptText),
      lineCount: fragments.length,
    },
    fragments,
    fragmentHashes: fragments.map((fragment) => fragment.hash),
    formatMetadata: {
      sourceFormat: options.format,
      extractionMode: "selectable_text",
      renderedPageCount: 1,
      parserVersion: null,
    },
  };
}

function t210Profile(
  profileId: "pdf-english-anonymous" | "docx-english-anonymous",
): DeterministicFixtureProfile {
  const profile = deterministicFixtureProfiles.find(
    (candidate) => candidate.profileId === profileId,
  );
  if (profile === undefined) {
    throw new Error(`Missing T210 fixture profile "${profileId}".`);
  }
  return profile;
}

export const semanticParserFixtureIds: readonly SemanticParserFixtureId[] = [
  "pdf-english-anonymous",
  "docx-english-anonymous",
  "pdf-french-anonymous",
  "pdf-french-canonical-anonymous",
  "docx-french-anonymous",
  "pdf-bilingual-anonymous",
  "docx-bilingual-anonymous",
  "pdf-english-multi-column-anonymous",
  "docx-french-multi-column-anonymous",
];

export const semanticParserFixtureInputs: Readonly<
  Record<SemanticParserFixtureId, SemanticParserFixtureInput>
> = {
  "pdf-english-anonymous": fromT210Profile(
    t210Profile("pdf-english-anonymous"),
  ),
  "docx-english-anonymous": fromT210Profile(
    t210Profile("docx-english-anonymous"),
  ),
  "pdf-french-anonymous": fromLines({
    id: "pdf-french-anonymous",
    format: "pdf",
    language: "french",
    layout: "single_column",
    lines: [
      "Élodie Marchand",
      "elodie.marchand@example.test",
      "Lyon, France",
      "+33 4 72 10 20 30",
      "Ingénieure logicielle senior",
      "Profil",
      "Développeuse backend avec huit ans d'expérience en systèmes distribués.",
      "Expérience professionnelle",
      "BlueWave Technologies",
      "Ingénieure logicielle senior",
      "2021 – aujourd'hui",
      "Encadre l'équipe plateforme de paiement composée de six ingénieurs.",
      "Ingénieure logicielle",
      "2018 – 2021",
      "Développe et exploite le service de notifications clients.",
      "Formation",
      "Master en informatique",
      "Institut Polytechnique des Sciences",
      "2013 – 2018",
      "Compétences",
      "TypeScript, Node.js, PostgreSQL, Kubernetes",
      "Langues",
      "Français (natif), Anglais (professionnel)",
      "Certifications",
      "Certification en architecture cloud",
      "2022",
      "Liens",
      "https://portfolio.example.test",
      "Projets",
      "Outil open source de génération de rapports",
    ],
  }),
  /**
   * Canonical real-document French PDF fixture (T248). The transcript below is
   * pinned to the deterministic selectable-text extraction of
   * `tests/fixtures/resumes/anonymous-french-resume.pdf` produced by
   * `PdfJsPdfAdapter` (see
   * `tests/integration/import-resume/french-pdf-fixture-evaluation.integration.test.ts`).
   * The integration verifier proves the live extraction reproduces these lines
   * byte-for-byte, so the corpus never drifts from the binary fixture.
   */
  "pdf-french-canonical-anonymous": fromLines({
    id: "pdf-french-canonical-anonymous",
    format: "pdf",
    language: "french",
    layout: "single_column",
    lines: [
      "Léa Dupont-Exemple",
      "Ingénieure Systèmes",
      "lea.exemple@example.invalid",
      "Nantes, France",
      "RÉSUMÉ",
      "Ingénieure systèmes qui simplifie des processus d'approbation fictifs.",
      "EXPÉRIENCE",
      "Atelier Fictif Lumière (employeur fictif)",
      "Ingénieure Systèmes",
      "avril 2022 – décembre 2024",
      "- A cartographié 18 parcours d'approbation fictifs.",
      "- A écrit des vérifications JSON pour 300 enregistrements fictifs.",
      "- « Résilience opérationnelle » apparaît sans périmètre défini.",
      "FORMATION",
      "Institut de Design Fictif",
      "Diplôme en Design de Systèmes",
      "2019–2022",
      "COMPÉTENCES : JSON ; Cartographie ; Tests",
      "LANGUES : Français — courant ; Anglais — professionnel",
      "CERTIFICATION : Médaille fictive de sécurité, 2024",
      "ABSENT : téléphone, lieu de l'employeur, mention, émetteur, type d'emploi.",
    ],
  }),
  "docx-french-anonymous": fromLines({
    id: "docx-french-anonymous",
    format: "docx",
    language: "french",
    layout: "single_column",
    lines: [
      "Julien Lefèvre",
      "julien.lefevre@example.test",
      "Nantes, France",
      "Chef de projet produit",
      "Profil",
      "Chef de projet produit orienté design thinking et méthodes agiles.",
      "Expérience professionnelle",
      "Atelier Nord",
      "Chef de projet produit",
      "2019/2022",
      "Coordonne trois équipes produit et les rituels de cadence.",
      "Studio Lumière",
      "Product Owner",
      "2022 – présent",
      "Définit la feuille de route du portefeuille mobile.",
      "Formation",
      "Master en management de projet",
      "Institut Européen de Gestion",
      "2014 – 2018",
      "Compétences",
      "Gestion de produit, Méthodes agiles, Analyse de données",
      "Langues",
      "Français (natif), Anglais (courant)",
      "Certifications",
      "Certification en gestion de produit",
      "2021",
      "Liens",
      "https://cv-lefevre.example.test",
    ],
  }),
  "pdf-bilingual-anonymous": fromLines({
    id: "pdf-bilingual-anonymous",
    format: "pdf",
    language: "bilingual_french_english",
    layout: "multi_column",
    lines: [
      "Alex Martin",
      "alex.martin@example.test",
      "Paris, France",
      "+33 6 98 76 54 32",
      "Ingénieur produit / Product Engineer",
      "Compétences",
      "TypeScript, React, Python, AWS",
      "Langues",
      "Français (natif), Anglais (bilingue)",
      "Liens",
      "https://github.com/alex-martin-example",
      "https://portfolio-alexmartin.example.test",
      "Profil",
      "Ingénieur produit avec dix ans d'expérience en France et au Royaume-Uni.",
      "Expérience professionnelle",
      "Orbit Analytics",
      "Ingénieur produit senior",
      "2021 – Présent",
      "Pilote la roadmap produit et l'adoption de la plateforme analytique.",
      "Ingénieur produit",
      "2017 – 2021",
      "Développe des fonctionnalités de reporting pour les équipes data.",
      "Formation",
      "Master of Science in Computer Science",
      "Northbridge University",
      "2013 – 2017",
      "Projets",
      "Plateforme de visualisation open source",
      "Certifications",
      "Cloud Architecture Certification",
      "2020",
    ],
  }),
  "docx-bilingual-anonymous": fromLines({
    id: "docx-bilingual-anonymous",
    format: "docx",
    language: "bilingual_french_english",
    layout: "single_column",
    lines: [
      "Sara Benali",
      "sara.benali@example.test",
      "Bruxelles, Belgique",
      "Consultante data / Data Consultant",
      "Profil",
      "Consultante data spécialisée en visualisation et en gouvernance des données. / Data consultant specialized in visualization and data governance.",
      "Expérience professionnelle",
      "DataViz Studio",
      "Consultante data senior",
      "2020/2024",
      "Construit des tableaux de bord pour des équipes financières. / Builds dashboards for finance teams.",
      "Consultante data",
      "2017 – 2020",
      "Automatise les rapports de reporting mensuels. / Automates monthly reporting pipelines.",
      "Formation",
      "Master en statistiques / Master of Science in Statistics",
      "Université du Nord-Est",
      "2013 – 2017",
      "Compétences",
      "SQL, Python, Tableau, dbt",
      "Langues",
      "Français (natif), Anglais (professionnel), Néerlandais (intermédiaire)",
      "Certifications",
      "Certification en gouvernance des données",
      "2021",
      "Liens",
      "https://www.example.test/sara-benali-data",
      "Projets",
      "Atlas des données ouvertes",
    ],
  }),
  "pdf-english-multi-column-anonymous": fromLines({
    id: "pdf-english-multi-column-anonymous",
    format: "pdf",
    language: "english",
    layout: "multi_column",
    lines: [
      "Daniel Brooks",
      "daniel.brooks@example.test",
      "London, United Kingdom",
      "Data Platform Engineer",
      "Summary",
      "Data platform engineer focused on reliable streaming infrastructure.",
      "Work Experience",
      "CoreStream Technologies",
      "Senior Data Engineer",
      "2019 – Present",
      "Lead the streaming platform team of five engineers.",
      "Data Engineer",
      "2016 – 2019",
      "Built and operated the batch analytics pipeline.",
      "Bright Analytics",
      "Data Analyst",
      "2014 – 2016",
      "Supported BI reporting for the growth team.",
      "Education",
      "BSc Computer Science",
      "Northbridge University",
      "2012 – 2016",
      "Skills",
      "Python, Kafka, Spark, Terraform",
      "Languages",
      "English (native), French (conversational)",
      "Certifications",
      "Cloud Architecture Certification",
      "2021",
      "Links",
      "https://github.com/daniel-brooks-example",
      "Projects",
      "Streaming metrics dashboard",
    ],
  }),
  "docx-french-multi-column-anonymous": fromLines({
    id: "docx-french-multi-column-anonymous",
    format: "docx",
    language: "french",
    layout: "multi_column",
    lines: [
      "Claire Fontaine",
      "claire.fontaine@example.test",
      "Genève, Suisse",
      "+41 22 555 01 23",
      "Consultante en stratégie digitale",
      "Profil",
      "Consultante en stratégie digitale spécialisée en transformation des organisations.",
      "Expérience professionnelle",
      "Atlas Consulting",
      "Consultante senior",
      "2018/2023",
      "Accompagne des organisations dans leur transformation digitale.",
      "Consultante",
      "2015 – 2018",
      "Réalise des diagnostics stratégiques pour des PME.",
      "Formation",
      "Master en stratégie digitale",
      "Institut Européen de Gestion",
      "2011 – 2015",
      "Compétences",
      "Stratégie, Transformation digitale, Gestion de projet",
      "Langues",
      "Français (natif), Allemand (courant), Anglais (professionnel)",
      "Certifications",
      "Certification en cybersécurité",
      "2019",
      "Liens",
      "https://www.example.test/claire-fontaine-portfolio",
      "Projets",
      "Tableau de bord de maturité digitale",
    ],
  }),
};

export function buildSemanticParserFixtureRequest(
  fixtureId: SemanticParserFixtureId,
  identifiers?: {
    readonly importId?: string;
    readonly correlationId?: string;
  },
): ResumeSemanticParseRequest {
  const input = semanticParserFixtureInputs[fixtureId];
  if (input === undefined) {
    throw new Error(`Unknown semantic parser fixture "${fixtureId}".`);
  }
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: identifiers?.importId ?? `fixture-${fixtureId}`,
    correlationId: identifiers?.correlationId ?? null,
    documentFormat: input.format,
    languageContext: {
      detectedLanguage: input.language,
      confidence: "high",
      textDirection: "ltr",
    },
    normalizedTranscript: input.transcript,
    sourceFragments: input.fragments.map((fragment) => ({ ...fragment })),
    fragmentHashes: [...input.fragmentHashes],
    formatMetadata: input.formatMetadata,
  };
}

export type { DeterministicFixtureProfile, NuvitaeSemanticExtractionResponse };
