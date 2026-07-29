import type {
  Certification,
  Education,
  LanguageSkill,
  ManualStructuredResumeDraft,
  ProfessionalLink,
  Project,
  Skill,
  SourcedText,
  StructuredResumeContent,
  UserId,
  WorkExperience,
} from "./types.js";

export const manualDraftLimits = {
  text: 2_000,
  headline: 180,
  summary: 4_000,
  personalItems: 12,
  contactItems: 12,
  workExperiences: 25,
  workRolesPerEmployer: 8,
  roleDetails: 24,
  educationItems: 20,
  skills: 80,
  languages: 20,
  projects: 30,
  projectLinks: 8,
  certifications: 40,
  professionalLinks: 20,
} as const;

export type ManualDraftValidationCode =
  | "text_too_long"
  | "too_many_items"
  | "ongoing_role_has_end_date"
  | "empty_required_value";

export interface ManualDraftValidationIssue {
  readonly code: ManualDraftValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ManualDraftValidationResult =
  | { readonly ok: true; readonly content: StructuredResumeContent }
  | {
      readonly ok: false;
      readonly issues: readonly ManualDraftValidationIssue[];
    };

export function createBlankManualStructuredResumeContent(): StructuredResumeContent {
  return {
    personal: [],
    contact: [],
    workExperiences: [],
    education: [],
    skills: [],
    languages: [],
    projects: [],
    certifications: [],
    professionalLinks: [],
  };
}

export function createBlankManualStructuredResumeDraft(input: {
  readonly id: string;
  readonly ownerUserId: UserId;
  readonly createdAt: Date;
  readonly source?: ManualStructuredResumeDraft["source"];
}): ManualStructuredResumeDraft {
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    source: input.source ?? "manual_entry",
    status: "editing",
    content: createBlankManualStructuredResumeContent(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function manualSourcedText(value: string): SourcedText {
  return {
    value: normalizeText(value),
    sourceStatus: "user_added",
    confidenceStatus: "not_applicable",
    inferenceStatus: "not_inferred",
  };
}

export function normalizeManualContent(
  content: StructuredResumeContent,
): StructuredResumeContent {
  const text = (value: SourcedText): SourcedText =>
    manualSourcedText(value.value);
  const optionalText = (value: SourcedText | undefined) =>
    value === undefined || normalizeText(value.value) === ""
      ? undefined
      : text(value);
  const keepText = (value: SourcedText) => normalizeText(value.value) !== "";
  const headline = optionalText(content.headline);
  const summary = optionalText(content.summary);

  return {
    personal: content.personal.map(text).filter(keepText),
    contact: content.contact.map(text).filter(keepText),
    ...(headline === undefined ? {} : { headline }),
    ...(summary === undefined ? {} : { summary }),
    workExperiences: content.workExperiences
      .map((experience): WorkExperience => ({
        id: experience.id,
        employerName: normalizeText(experience.employerName),
        ...(normalizeText(experience.employerLocation ?? "") === ""
          ? {}
          : { employerLocation: normalizeText(experience.employerLocation) }),
        reviewStatus: "edited",
        inferenceStatus: "not_inferred",
        roles: experience.roles
          .map((role): WorkExperience["roles"][number] => ({
            id: role.id,
            title: normalizeText(role.title),
            ...(normalizeText(role.location ?? "") === ""
              ? {}
              : { location: normalizeText(role.location) }),
            ...(role.startDate === undefined
              ? {}
              : { startDate: role.startDate }),
            ...(role.isOngoing || role.endDate === undefined
              ? {}
              : { endDate: role.endDate }),
            isOngoing: role.isOngoing,
            responsibilities: role.responsibilities.map(text).filter(keepText),
            achievements: role.achievements.map(text).filter(keepText),
            sourceStatus: "user_added",
            reviewStatus: "edited",
            inferenceStatus: "not_inferred",
          }))
          .filter((role) => role.title !== ""),
      }))
      .filter(
        (experience) =>
          experience.employerName !== "" || experience.roles.length > 0,
      ),
    education: content.education
      .map((item): Education => {
        const credential = optionalText(item.credential);
        const fieldOfStudy = optionalText(item.fieldOfStudy);
        const location = optionalText(item.location);
        return {
          id: item.id,
          institution: text(item.institution),
          ...(credential === undefined ? {} : { credential }),
          ...(fieldOfStudy === undefined ? {} : { fieldOfStudy }),
          ...(location === undefined ? {} : { location }),
          ...(item.startDate === undefined
            ? {}
            : { startDate: item.startDate }),
          ...(item.endDate === undefined ? {} : { endDate: item.endDate }),
          reviewStatus: "edited",
        };
      })
      .filter((item) => keepText(item.institution)),
    skills: content.skills
      .map((item): Skill => ({
        id: item.id,
        name: text(item.name),
        ...(normalizeText(item.category ?? "") === ""
          ? {}
          : { category: normalizeText(item.category) }),
        reviewStatus: "edited",
      }))
      .filter((item) => keepText(item.name)),
    languages: content.languages
      .map((item): LanguageSkill => {
        const proficiency = optionalText(item.proficiency);
        return {
          id: item.id,
          name: text(item.name),
          ...(proficiency === undefined ? {} : { proficiency }),
          reviewStatus: "edited",
        };
      })
      .filter((item) => keepText(item.name)),
    projects: content.projects
      .map((item): Project => {
        const description = optionalText(item.description);
        return {
          id: item.id,
          name: text(item.name),
          ...(description === undefined ? {} : { description }),
          links: item.links.map(normalizeProfessionalLink).filter(linkHasUrl),
          reviewStatus: "edited",
        };
      })
      .filter((item) => keepText(item.name)),
    certifications: content.certifications
      .map((item): Certification => {
        const issuer = optionalText(item.issuer);
        return {
          id: item.id,
          name: text(item.name),
          ...(issuer === undefined ? {} : { issuer }),
          ...(item.issuedAt === undefined ? {} : { issuedAt: item.issuedAt }),
          ...(item.expiresAt === undefined
            ? {}
            : { expiresAt: item.expiresAt }),
          reviewStatus: "edited",
        };
      })
      .filter((item) => keepText(item.name)),
    professionalLinks: content.professionalLinks
      .map(normalizeProfessionalLink)
      .filter(linkHasUrl),
  };
}

export function validateManualContent(
  content: StructuredResumeContent,
): ManualDraftValidationResult {
  const normalized = normalizeManualContent(content);
  const issues: ManualDraftValidationIssue[] = [];
  checkCount(
    issues,
    "personal",
    normalized.personal,
    manualDraftLimits.personalItems,
  );
  checkCount(
    issues,
    "contact",
    normalized.contact,
    manualDraftLimits.contactItems,
  );
  checkText(
    issues,
    "headline",
    normalized.headline?.value,
    manualDraftLimits.headline,
  );
  checkText(
    issues,
    "summary",
    normalized.summary?.value,
    manualDraftLimits.summary,
  );
  checkCount(
    issues,
    "workExperiences",
    normalized.workExperiences,
    manualDraftLimits.workExperiences,
  );
  normalized.workExperiences.forEach((experience, index) => {
    checkText(
      issues,
      `workExperiences.${index}.employerName`,
      experience.employerName,
    );
    checkCount(
      issues,
      `workExperiences.${index}.roles`,
      experience.roles,
      manualDraftLimits.workRolesPerEmployer,
    );
    experience.roles.forEach((role, roleIndex) => {
      checkText(
        issues,
        `workExperiences.${index}.roles.${roleIndex}.title`,
        role.title,
      );
      checkCount(
        issues,
        `workExperiences.${index}.roles.${roleIndex}.responsibilities`,
        role.responsibilities,
        manualDraftLimits.roleDetails,
      );
      checkCount(
        issues,
        `workExperiences.${index}.roles.${roleIndex}.achievements`,
        role.achievements,
        manualDraftLimits.roleDetails,
      );
      if (role.isOngoing && role.endDate !== undefined) {
        issues.push({
          code: "ongoing_role_has_end_date",
          path: `workExperiences.${index}.roles.${roleIndex}.endDate`,
          message: "Ongoing roles cannot have an end date.",
        });
      }
    });
  });
  checkCount(
    issues,
    "education",
    normalized.education,
    manualDraftLimits.educationItems,
  );
  checkCount(issues, "skills", normalized.skills, manualDraftLimits.skills);
  checkCount(
    issues,
    "languages",
    normalized.languages,
    manualDraftLimits.languages,
  );
  checkCount(
    issues,
    "projects",
    normalized.projects,
    manualDraftLimits.projects,
  );
  normalized.projects.forEach((project, index) =>
    checkCount(
      issues,
      `projects.${index}.links`,
      project.links,
      manualDraftLimits.projectLinks,
    ),
  );
  checkCount(
    issues,
    "certifications",
    normalized.certifications,
    manualDraftLimits.certifications,
  );
  checkCount(
    issues,
    "professionalLinks",
    normalized.professionalLinks,
    manualDraftLimits.professionalLinks,
  );

  return issues.length === 0
    ? { ok: true, content: normalized }
    : { ok: false, issues };
}

export function updateManualDraftContent(
  draft: ManualStructuredResumeDraft,
  content: StructuredResumeContent,
  updatedAt: Date,
): ManualStructuredResumeDraft {
  const validation = validateManualContent(content);
  if (!validation.ok) {
    throw new ManualDraftValidationError(validation.issues);
  }
  return {
    ...draft,
    content: validation.content,
    updatedAt,
  };
}

export function addSectionItem<T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
): readonly T[] {
  return [...items, item];
}

export function updateSectionItem<T extends { readonly id: string }>(
  items: readonly T[],
  itemId: string,
  update: (item: T) => T,
): readonly T[] {
  return items.map((item) => (item.id === itemId ? update(item) : item));
}

export function removeSectionItem<T extends { readonly id: string }>(
  items: readonly T[],
  itemId: string,
): readonly T[] {
  return items.filter((item) => item.id !== itemId);
}

export function reorderSectionItem<T extends { readonly id: string }>(
  items: readonly T[],
  itemId: string,
  targetIndex: number,
): readonly T[] {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) return items;
  const next = [...items];
  const [item] = next.splice(currentIndex, 1);
  if (item === undefined) return items;
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, item);
  return next;
}

export class ManualDraftValidationError extends Error {
  constructor(readonly issues: readonly ManualDraftValidationIssue[]) {
    super("Manual draft content is invalid.");
    this.name = "ManualDraftValidationError";
  }
}

function normalizeProfessionalLink(link: ProfessionalLink): ProfessionalLink {
  return {
    id: link.id,
    ...(normalizeText(link.label ?? "") === ""
      ? {}
      : { label: normalizeText(link.label) }),
    url: manualSourcedText(link.url.value),
    reviewStatus: "edited",
  };
}

function linkHasUrl(link: ProfessionalLink): boolean {
  return normalizeText(link.url.value) !== "";
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().replace(/[ \t\r\n]+/g, " ");
}

function checkText(
  issues: ManualDraftValidationIssue[],
  path: string,
  value: string | undefined,
  limit: number = manualDraftLimits.text,
): void {
  if (value !== undefined && value.length > limit) {
    issues.push({
      code: "text_too_long",
      path,
      message: "This value is too long.",
    });
  }
}

function checkCount(
  issues: ManualDraftValidationIssue[],
  path: string,
  items: readonly unknown[],
  limit: number,
): void {
  if (items.length > limit) {
    issues.push({
      code: "too_many_items",
      path,
      message: "This section has too many entries.",
    });
  }
}
