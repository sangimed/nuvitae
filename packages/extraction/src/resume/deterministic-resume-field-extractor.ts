import type {
  ExtractionDocumentFormat,
  ExtractionLanguage,
  DeterministicSourceLocation,
} from "../adapters.js";
import type { ResumeSourceFragment } from "./source-fragments.js";

export type DeterministicResumeSection =
  | "personal"
  | "contact"
  | "headline"
  | "summary"
  | "work_experience"
  | "education"
  | "skills"
  | "languages"
  | "projects"
  | "certifications"
  | "professional_links";

export type DeterministicCandidateValue =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "text_list"; readonly values: readonly string[] }
  | { readonly kind: "link"; readonly url: string; readonly label?: string }
  | {
      readonly kind: "language";
      readonly name: string;
      readonly proficiency?: string;
    };

export interface DeterministicResumeFieldCandidate {
  readonly section: DeterministicResumeSection;
  readonly fieldPath: string;
  readonly value: DeterministicCandidateValue;
  readonly sourceLocation: DeterministicSourceLocation;
  readonly confidence: "high" | "medium" | "low" | "not_applicable";
  readonly inferenceStatus: "not_inferred" | "inferred_needs_review";
  readonly sourceOrder: number;
}

export interface DeterministicWarningCandidate {
  readonly warningType:
    | "missing"
    | "ambiguous"
    | "duplicate"
    | "conflicting"
    | "low_confidence"
    | "inferred"
    | "partial"
    | "unsupported";
  readonly section: DeterministicResumeSection;
  readonly fieldPath?: string;
  readonly message: string;
  readonly requiresResolution: boolean;
  readonly candidateIndexes?: readonly number[];
}

export interface DeterministicResumeFieldExtraction {
  readonly fields: readonly DeterministicResumeFieldCandidate[];
  readonly warnings: readonly DeterministicWarningCandidate[];
  readonly missingOrUnprocessedSections: readonly DeterministicResumeSection[];
  readonly category: "complete" | "partial" | "no_supported_field";
}

const headings: readonly [DeterministicResumeSection, readonly string[]][] = [
  ["summary", ["summary", "profile", "profil", "à propos"]],
  [
    "work_experience",
    ["experience", "work experience", "expérience professionnelle"],
  ],
  ["education", ["education", "formation"]],
  ["skills", ["skills", "compétences"]],
  ["languages", ["languages", "langues"]],
  ["projects", ["projects", "projets"]],
  ["certifications", ["certifications", "certification"]],
  ["professional_links", ["links", "liens"]],
  ["headline", ["headline", "title", "titre"]],
];

const labels: readonly [DeterministicResumeSection, string, string][] = [
  ["personal", "name", "personal.name"],
  ["personal", "nom", "personal.name"],
  ["contact", "email", "contact.email"],
  ["contact", "e-mail", "contact.email"],
  ["contact", "courriel", "contact.email"],
  ["contact", "phone", "contact.phone"],
  ["contact", "téléphone", "contact.phone"],
  ["contact", "location", "contact.location"],
  ["contact", "localisation", "contact.location"],
  ["headline", "headline", "headline"],
  ["headline", "title", "headline"],
  ["headline", "titre", "headline"],
];

const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const phone = /^(?:\+?[0-9][0-9 ()./-]{6,}[0-9])$/u;
const url = /https?:\/\/[^\s<>()]+/giu;

export class DeterministicResumeFieldExtractor {
  extract(
    fragments: readonly ResumeSourceFragment[],
    language: ExtractionLanguage,
    _format: ExtractionDocumentFormat,
  ): DeterministicResumeFieldExtraction {
    if (language === "unsupported" || language === "unknown") return noFields();
    const fields: DeterministicResumeFieldCandidate[] = [];
    let section: DeterministicResumeSection | undefined;
    const ordered = [...fragments].sort((a, b) => a.order - b.order);
    for (const fragment of ordered) {
      const raw = fragment.text.trim();
      if (!raw) continue;
      const normalized = normalize(raw);
      const heading = headings.find(([, names]) =>
        names.some(
          (name) =>
            normalized === normalize(name) ||
            normalized.startsWith(`${normalize(name)}:`),
        ),
      );
      if (heading) {
        section = heading[0];
        const value = afterColon(raw);
        if (value) addSectionValue(fields, section, value, fragment);
        continue;
      }
      const labelled = labels.find(([, name]) =>
        normalized.startsWith(`${normalize(name)}:`),
      );
      if (labelled) {
        const value = afterColon(raw);
        if (value)
          addLabelValue(fields, labelled[0], labelled[2], value, fragment);
        continue;
      }
      const links = [...raw.matchAll(url)];
      for (const match of links) {
        const value = match[0].replace(/[.,;]+$/u, "");
        fields.push(
          candidate(
            "professional_links",
            "professional_links.url",
            { kind: "link", url: value },
            fragment,
          ),
        );
      }
      if (email.test(raw)) {
        const value = raw.match(/[^\s@]+@[^\s@]+\.[^\s@]+/u)?.[0];
        if (value)
          fields.push(
            candidate(
              "contact",
              "contact.email",
              { kind: "text", value },
              fragment,
            ),
          );
      }
      if (phone.test(raw))
        fields.push(
          candidate(
            "contact",
            "contact.phone",
            { kind: "text", value: raw },
            fragment,
          ),
        );
      if (section) {
        addSectionValue(fields, section, raw, fragment);
        continue;
      }
    }
    const missing: DeterministicResumeSection[] = [];
    if (
      !fields.some(
        (field) => field.section === "personal" || field.section === "contact",
      )
    )
      missing.push("personal");
    if (
      !fields.some(
        (field) =>
          field.section === "work_experience" || field.section === "education",
      )
    )
      missing.push("work_experience");
    if (!fields.some((field) => field.section === "skills"))
      missing.push("skills");
    const warnings: DeterministicWarningCandidate[] = missing.map(
      (missingSection) => ({
        warningType: "missing",
        section: missingSection,
        message: `Add information for ${sectionLabel(missingSection)} before confirmation.`,
        requiresResolution: true,
      }),
    );
    return {
      fields,
      warnings,
      missingOrUnprocessedSections: missing,
      category:
        fields.length === 0
          ? "no_supported_field"
          : missing.length
            ? "partial"
            : "complete",
    };
  }
}

function addLabelValue(
  fields: DeterministicResumeFieldCandidate[],
  section: DeterministicResumeSection,
  path: string,
  value: string,
  fragment: ResumeSourceFragment,
): void {
  if (path === "contact.email" && !email.test(value)) return;
  if (path === "contact.phone" && !phone.test(value)) return;
  fields.push(candidate(section, path, { kind: "text", value }, fragment));
}

function addSectionValue(
  fields: DeterministicResumeFieldCandidate[],
  section: DeterministicResumeSection,
  value: string,
  fragment: ResumeSourceFragment,
): void {
  const path = `${section}.${section === "work_experience" ? "entry" : "value"}`;
  if (section === "skills") {
    for (const item of value
      .split(/[,;|•]/u)
      .map((item) => item.trim())
      .filter(Boolean))
      fields.push(
        candidate(
          section,
          "skills.name",
          { kind: "text", value: item },
          fragment,
        ),
      );
    return;
  }
  if (section === "languages") {
    for (const item of value
      .split(/[,;|•]/u)
      .map((item) => item.trim())
      .filter(Boolean))
      fields.push(
        candidate(
          section,
          "languages.name",
          { kind: "language", name: item },
          fragment,
        ),
      );
    return;
  }
  if (section === "professional_links") {
    for (const match of value.matchAll(url))
      fields.push(
        candidate(
          section,
          "professional_links.url",
          { kind: "link", url: match[0] },
          fragment,
        ),
      );
    return;
  }
  fields.push(candidate(section, path, { kind: "text", value }, fragment));
}

function candidate(
  section: DeterministicResumeSection,
  fieldPath: string,
  value: DeterministicCandidateValue,
  fragment: ResumeSourceFragment,
): DeterministicResumeFieldCandidate {
  return {
    section,
    fieldPath,
    value,
    sourceLocation: fragment.location,
    confidence: "high",
    inferenceStatus: "not_inferred",
    sourceOrder: fragment.order,
  };
}
function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
function afterColon(value: string): string {
  return value.includes(":") ? value.slice(value.indexOf(":") + 1).trim() : "";
}
function sectionLabel(section: DeterministicResumeSection): string {
  return section.replaceAll("_", " ");
}
function noFields(): DeterministicResumeFieldExtraction {
  return {
    fields: [],
    warnings: [],
    missingOrUnprocessedSections: [],
    category: "no_supported_field",
  };
}
