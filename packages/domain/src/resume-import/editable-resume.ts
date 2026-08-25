import {
  validateManualContent,
  type ManualDraftValidationIssue,
} from "./manual-draft.js";
import type {
  Certification,
  Education,
  LanguageSkill,
  ProfessionalLink,
  Project,
  Skill,
  SourcedText,
  StructuredResume,
  StructuredResumeContent,
  WorkExperience,
  WorkExperienceRole,
} from "./types.js";

export class StructuredResumeValidationError extends Error {
  constructor(readonly issues: readonly ManualDraftValidationIssue[]) {
    super("The structured resume content is invalid.");
    this.name = "StructuredResumeValidationError";
  }
}

/**
 * Applies editor content to a confirmed resume without trusting provenance
 * metadata supplied by the browser. Unchanged values retain their persisted
 * grounding; changed and new values become user-edited/user-added facts.
 */
export function updateConfirmedStructuredResumeContent(
  current: StructuredResume,
  editableContent: StructuredResumeContent,
  updatedAt: Date,
): StructuredResume {
  const validation = validateManualContent(editableContent);
  if (!validation.ok) {
    throw new StructuredResumeValidationError(validation.issues);
  }
  const next = validation.content;
  return {
    ...current,
    content: {
      ...(next.sectionOrder === undefined
        ? {}
        : { sectionOrder: [...next.sectionOrder] }),
      personal: reconcileTextArray(next.personal, current.content.personal),
      contact: reconcileTextArray(next.contact, current.content.contact),
      ...optionalText("headline", next.headline, current.content.headline),
      ...optionalText("summary", next.summary, current.content.summary),
      workExperiences: next.workExperiences.map((item) =>
        reconcileWorkExperience(
          item,
          current.content.workExperiences.find((value) => value.id === item.id),
        ),
      ),
      education: next.education.map((item) =>
        reconcileEducation(
          item,
          current.content.education.find((value) => value.id === item.id),
        ),
      ),
      skills: next.skills.map((item) =>
        reconcileSkill(
          item,
          current.content.skills.find((value) => value.id === item.id),
        ),
      ),
      languages: next.languages.map((item) =>
        reconcileLanguage(
          item,
          current.content.languages.find((value) => value.id === item.id),
        ),
      ),
      projects: next.projects.map((item) =>
        reconcileProject(
          item,
          current.content.projects.find((value) => value.id === item.id),
        ),
      ),
      certifications: next.certifications.map((item) =>
        reconcileCertification(
          item,
          current.content.certifications.find((value) => value.id === item.id),
        ),
      ),
      professionalLinks: next.professionalLinks.map((item) =>
        reconcileLink(
          item,
          current.content.professionalLinks.find(
            (value) => value.id === item.id,
          ),
        ),
      ),
    },
    updatedAt,
  };
}

function reconcileText(
  next: SourcedText,
  current: SourcedText | undefined,
  forceEdited = false,
): SourcedText {
  if (!forceEdited && current?.value === next.value) return current;
  return {
    value: next.value,
    sourceStatus: current === undefined ? "user_added" : "user_edited",
    confidenceStatus: "not_applicable",
    inferenceStatus: "not_inferred",
  };
}

function reconcileTextArray(
  next: readonly SourcedText[],
  current: readonly SourcedText[],
): SourcedText[] {
  return next.map((item, index) => reconcileText(item, current[index]));
}

function optionalText(
  key: "headline" | "summary",
  next: SourcedText | undefined,
  current: SourcedText | undefined,
): Partial<Pick<StructuredResumeContent, "headline" | "summary">> {
  return next === undefined ? {} : { [key]: reconcileText(next, current) };
}

function reconcileWorkExperience(
  next: WorkExperience,
  current: WorkExperience | undefined,
): WorkExperience {
  const changed =
    current === undefined ||
    current.employerName !== next.employerName ||
    current.employerLocation !== next.employerLocation;
  return {
    ...next,
    reviewStatus: changed ? "edited" : current.reviewStatus,
    inferenceStatus: changed ? "not_inferred" : current.inferenceStatus,
    roles: next.roles.map((role) =>
      reconcileRole(
        role,
        current?.roles.find((value) => value.id === role.id),
      ),
    ),
  };
}

function reconcileRole(
  next: WorkExperienceRole,
  current: WorkExperienceRole | undefined,
): WorkExperienceRole {
  const changed =
    current === undefined ||
    current.title !== next.title ||
    current.location !== next.location ||
    current.isOngoing !== next.isOngoing ||
    !same(current.startDate, next.startDate) ||
    !same(current.endDate, next.endDate);
  return {
    ...next,
    responsibilities: reconcileTextArray(
      next.responsibilities,
      current?.responsibilities ?? [],
    ),
    achievements: reconcileTextArray(
      next.achievements,
      current?.achievements ?? [],
    ),
    sourceStatus: changed
      ? current === undefined
        ? "user_added"
        : "user_edited"
      : current.sourceStatus,
    reviewStatus: changed ? "edited" : current.reviewStatus,
    inferenceStatus: changed ? "not_inferred" : current.inferenceStatus,
  };
}

function reconcileEducation(
  next: Education,
  current: Education | undefined,
): Education {
  const changed =
    current === undefined ||
    current.institution.value !== next.institution.value ||
    current.credential?.value !== next.credential?.value ||
    current.fieldOfStudy?.value !== next.fieldOfStudy?.value ||
    current.location?.value !== next.location?.value ||
    !same(current.startDate, next.startDate) ||
    !same(current.endDate, next.endDate);
  return {
    ...next,
    institution: reconcileText(next.institution, current?.institution, changed),
    ...optionalReconciled(
      "credential",
      next.credential,
      current?.credential,
      changed,
    ),
    ...optionalReconciled(
      "fieldOfStudy",
      next.fieldOfStudy,
      current?.fieldOfStudy,
      changed,
    ),
    ...optionalReconciled(
      "location",
      next.location,
      current?.location,
      changed,
    ),
    reviewStatus: changed ? "edited" : (current?.reviewStatus ?? "edited"),
  };
}

function reconcileSkill(next: Skill, current: Skill | undefined): Skill {
  const changed = current === undefined || current.category !== next.category;
  return {
    ...next,
    name: reconcileText(next.name, current?.name, changed),
    reviewStatus: changed ? "edited" : (current?.reviewStatus ?? "edited"),
  };
}

function reconcileLanguage(
  next: LanguageSkill,
  current: LanguageSkill | undefined,
): LanguageSkill {
  const changed =
    current === undefined ||
    current.name.value !== next.name.value ||
    current.proficiency?.value !== next.proficiency?.value;
  return {
    ...next,
    name: reconcileText(next.name, current?.name, changed),
    ...optionalReconciled(
      "proficiency",
      next.proficiency,
      current?.proficiency,
      changed,
    ),
    reviewStatus: changed ? "edited" : (current?.reviewStatus ?? "edited"),
  };
}

function reconcileProject(
  next: Project,
  current: Project | undefined,
): Project {
  const changed =
    current === undefined ||
    current.name.value !== next.name.value ||
    current.description?.value !== next.description?.value;
  return {
    ...next,
    name: reconcileText(next.name, current?.name, changed),
    ...optionalReconciled(
      "description",
      next.description,
      current?.description,
      changed,
    ),
    links: next.links.map((link) =>
      reconcileLink(
        link,
        current?.links.find((value) => value.id === link.id),
      ),
    ),
    reviewStatus: changed ? "edited" : (current?.reviewStatus ?? "edited"),
  };
}

function reconcileCertification(
  next: Certification,
  current: Certification | undefined,
): Certification {
  const changed =
    current === undefined ||
    current.name.value !== next.name.value ||
    current.issuer?.value !== next.issuer?.value ||
    !same(current.issuedAt, next.issuedAt) ||
    !same(current.expiresAt, next.expiresAt);
  return {
    ...next,
    name: reconcileText(next.name, current?.name, changed),
    ...optionalReconciled("issuer", next.issuer, current?.issuer, changed),
    reviewStatus: changed ? "edited" : (current?.reviewStatus ?? "edited"),
  };
}

function reconcileLink(
  next: ProfessionalLink,
  current: ProfessionalLink | undefined,
): ProfessionalLink {
  const changed = current === undefined || current.label !== next.label;
  return {
    ...next,
    url: reconcileText(next.url, current?.url, changed),
    reviewStatus: changed ? "edited" : (current?.reviewStatus ?? "edited"),
  };
}

function optionalReconciled<K extends string>(
  key: K,
  next: SourcedText | undefined,
  current: SourcedText | undefined,
  forceEdited = false,
): Partial<Record<K, SourcedText>> {
  return next === undefined
    ? {}
    : ({ [key]: reconcileText(next, current, forceEdited) } as Partial<
        Record<K, SourcedText>
      >);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
