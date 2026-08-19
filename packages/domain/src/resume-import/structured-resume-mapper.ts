import type {
  Certification,
  Education,
  ExtractedField,
  ExtractedValue,
  FieldSourceStatus,
  ImportDraft,
  ImportWarning,
  LanguageSkill,
  ProfessionalLink,
  Project,
  Skill,
  SourceLocation,
  SourcedText,
  StructuredResume,
  StructuredResumeContent,
  UserCorrection,
  WorkExperience,
  WorkExperienceRole,
} from "./types.js";
import { findUnresolvedRequiredWarnings } from "./validation.js";

export type StructuredResumeMappingBlockerCode =
  | "unresolved_warning"
  | "no_user_confirmed_field"
  | "unconfirmed_inference"
  | "unsupported_reviewed_shape"
  | "ambiguous_singular_field"
  | "invalid_reviewed_value"
  | "expired_draft"
  | "draft_not_ready";

export interface StructuredResumeMappingBlocker {
  readonly code: StructuredResumeMappingBlockerCode;
  readonly section?: ExtractedField["section"];
  readonly fieldLabel?: string;
  readonly affectedFieldCount?: number;
}

export interface StructuredResumeChildIdFactory {
  readonly textItemId: () => string;
  readonly workExperienceId: () => string;
  readonly workRoleId: () => string;
  readonly sectionItemId: () => string;
  readonly linkId: () => string;
}

export type StructuredResumeMappingResult =
  | { readonly ok: true; readonly resume: StructuredResume }
  | {
      readonly ok: false;
      readonly blockers: readonly StructuredResumeMappingBlocker[];
    };

export interface MapReviewedImportDraftInput {
  readonly draft: ImportDraft;
  readonly corrections: readonly UserCorrection[];
  readonly structuredResumeId: string;
  readonly childIds: StructuredResumeChildIdFactory;
  readonly confirmedAt: Date;
  readonly now: Date;
}

interface MutableStructuredResumeContent {
  readonly personal: SourcedText[];
  readonly contact: SourcedText[];
  headline?: SourcedText;
  summary?: SourcedText;
  readonly workExperiences: WorkExperience[];
  readonly education: Education[];
  readonly skills: Skill[];
  readonly languages: LanguageSkill[];
  readonly projects: Project[];
  readonly certifications: Certification[];
  readonly professionalLinks: ProfessionalLink[];
}

export function mapReviewedImportDraftToStructuredResume(
  input: MapReviewedImportDraftInput,
): StructuredResumeMappingResult {
  const blockers: StructuredResumeMappingBlocker[] = [];
  if (input.now.getTime() >= input.draft.retentionExpiresAt.getTime()) {
    blockers.push({ code: "expired_draft" });
  }
  if (input.draft.status !== "ready_to_confirm") {
    blockers.push({ code: "draft_not_ready" });
  }
  pushWarningBlockers(blockers, input.draft.warnings);
  const activeIncluded = input.draft.fields.filter(isIncludedField);
  if (activeIncluded.length === 0) {
    blockers.push({ code: "no_user_confirmed_field" });
  }
  for (const field of input.draft.fields) {
    if (
      field.reviewStatus !== "excluded" &&
      field.inferenceStatus === "inferred_needs_review"
    ) {
      blockers.push({
        code: "unconfirmed_inference",
        section: field.section,
        fieldLabel: safeFieldLabel(field.fieldPath),
        affectedFieldCount: 1,
      });
    }
  }

  const content = emptyContent();
  const singular: Record<"headline" | "summary", SourcedText[]> = {
    headline: [],
    summary: [],
  };
  const grouped = createGroupedAccumulator();

  for (const field of activeIncluded) {
    const target = safeFieldLabel(field.fieldPath);
    const mapped = mapField(field, input.childIds, singular, grouped, content);
    if (!mapped.ok) {
      blockers.push({
        code: mapped.code,
        section: field.section,
        fieldLabel: target,
        affectedFieldCount: 1,
      });
    }
  }

  if (singular.headline.length > 1) {
    blockers.push({
      code: "ambiguous_singular_field",
      section: "headline",
      fieldLabel: "headline",
      affectedFieldCount: singular.headline.length,
    });
  }
  if (singular.summary.length > 1) {
    blockers.push({
      code: "ambiguous_singular_field",
      section: "summary",
      fieldLabel: "summary",
      affectedFieldCount: singular.summary.length,
    });
  }
  for (const education of grouped.education.values()) {
    if (education.institution === undefined) {
      blockers.push({
        code: "invalid_reviewed_value",
        section: "education",
        fieldLabel: "institution",
        affectedFieldCount: 1,
      });
    }
  }
  if (blockers.length > 0) return { ok: false, blockers };

  const finished: StructuredResumeContent = {
    ...content,
    ...(singular.headline[0] === undefined
      ? {}
      : { headline: singular.headline[0] }),
    ...(singular.summary[0] === undefined
      ? {}
      : { summary: singular.summary[0] }),
    workExperiences: finishWorkExperiences(grouped.workExperiences),
    education: finishEducation(grouped.education),
    languages: finishLanguages(grouped.languages),
    projects: finishProjects(grouped.projects),
    certifications: finishCertifications(grouped.certifications),
  };

  return {
    ok: true,
    resume: {
      id: input.structuredResumeId,
      ownerUserId: input.draft.ownerUserId,
      sourceImportDraftId: input.draft.id,
      provenanceLabel: "imported_from_initial_resume",
      confirmationStatus: "confirmed",
      content: finished,
      createdAt: input.confirmedAt,
      updatedAt: input.confirmedAt,
    },
  };
}

export function reduceStructuredResumeSourceProvenance(
  resume: StructuredResume,
  sourceDeletedAt?: Date,
): StructuredResume {
  const reduceText = (text: SourcedText): SourcedText => {
    const shouldReduce =
      text.sourceStatus === "explicit_source" ||
      text.sourceLocation?.kind === "pdf" ||
      text.sourceLocation?.kind === "docx" ||
      text.sourceLocation?.kind === "semantic";
    return {
      ...text,
      ...(shouldReduce
        ? {
            sourceLocation: {
              kind: "minimal" as const,
              label: "imported_from_initial_resume" as const,
              confirmedByUser: true,
              ...(sourceDeletedAt === undefined ? {} : { sourceDeletedAt }),
            },
          }
        : optionalSourceLocation(text.sourceLocation)),
      sourceStatus:
        text.sourceStatus === "explicit_source"
          ? "source_deleted_minimal_provenance"
          : text.sourceStatus,
    };
  };
  return {
    ...resume,
    content: {
      personal: resume.content.personal.map(reduceText),
      contact: resume.content.contact.map(reduceText),
      ...(resume.content.headline === undefined
        ? {}
        : { headline: reduceText(resume.content.headline) }),
      ...(resume.content.summary === undefined
        ? {}
        : { summary: reduceText(resume.content.summary) }),
      workExperiences: resume.content.workExperiences.map((experience) => ({
        ...experience,
        roles: experience.roles.map((role) => ({
          ...role,
          responsibilities: role.responsibilities.map(reduceText),
          achievements: role.achievements.map(reduceText),
        })),
      })),
      education: resume.content.education.map((item) => ({
        ...item,
        institution: reduceText(item.institution),
        ...(item.credential === undefined
          ? {}
          : { credential: reduceText(item.credential) }),
        ...(item.fieldOfStudy === undefined
          ? {}
          : { fieldOfStudy: reduceText(item.fieldOfStudy) }),
        ...(item.location === undefined
          ? {}
          : { location: reduceText(item.location) }),
      })),
      skills: resume.content.skills.map((item) => ({
        ...item,
        name: reduceText(item.name),
      })),
      languages: resume.content.languages.map((item) => ({
        ...item,
        name: reduceText(item.name),
        ...(item.proficiency === undefined
          ? {}
          : { proficiency: reduceText(item.proficiency) }),
      })),
      projects: resume.content.projects.map((item) => ({
        ...item,
        name: reduceText(item.name),
        ...(item.description === undefined
          ? {}
          : { description: reduceText(item.description) }),
        links: item.links.map((link) => ({
          ...link,
          url: reduceText(link.url),
        })),
      })),
      certifications: resume.content.certifications.map((item) => ({
        ...item,
        name: reduceText(item.name),
        ...(item.issuer === undefined
          ? {}
          : { issuer: reduceText(item.issuer) }),
      })),
      professionalLinks: resume.content.professionalLinks.map((item) => ({
        ...item,
        url: reduceText(item.url),
      })),
    },
  };
}

function mapField(
  field: ExtractedField,
  childIds: StructuredResumeChildIdFactory,
  singular: Record<"headline" | "summary", SourcedText[]>,
  grouped: GroupedAccumulator,
  content: MutableStructuredResumeContent,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly code: StructuredResumeMappingBlockerCode } {
  switch (field.section) {
    case "personal": {
      const text = toSourcedText(field);
      if (text === undefined)
        return { ok: false, code: "invalid_reviewed_value" };
      content.personal.push(text);
      return { ok: true };
    }
    case "contact": {
      const text = toSourcedText(field);
      if (text === undefined)
        return { ok: false, code: "invalid_reviewed_value" };
      content.contact.push(text);
      return { ok: true };
    }
    case "headline": {
      const text = toSourcedText(field);
      if (text === undefined)
        return { ok: false, code: "invalid_reviewed_value" };
      singular.headline.push(text);
      return { ok: true };
    }
    case "summary": {
      const text = toSourcedText(field);
      if (text === undefined)
        return { ok: false, code: "invalid_reviewed_value" };
      singular.summary.push(text);
      return { ok: true };
    }
    case "skills":
      return appendSkills(field, childIds, content);
    case "languages":
      return appendLanguage(field, childIds, grouped);
    case "professional_links":
      return appendProfessionalLink(field, childIds, content);
    case "work_experience":
      return appendWorkExperience(field, childIds, grouped);
    case "education":
      return appendEducation(field, childIds, grouped);
    case "projects":
      return appendProject(field, childIds, grouped);
    case "certifications":
      return appendCertification(field, childIds, grouped);
  }
}

function appendSkills(
  field: ExtractedField,
  childIds: StructuredResumeChildIdFactory,
  content: MutableStructuredResumeContent,
) {
  const values =
    field.value.kind === "text_list"
      ? field.value.values
      : field.value.kind === "text"
        ? [field.value.value]
        : undefined;
  if (values === undefined)
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  values.forEach((value) =>
    content.skills.push({
      id: childIds.sectionItemId(),
      name: sourcedFromField(field, value),
      reviewStatus: field.reviewStatus,
    }),
  );
  return { ok: true as const };
}

function appendLanguage(
  field: ExtractedField,
  childIds: StructuredResumeChildIdFactory,
  grouped: GroupedAccumulator,
) {
  const match = /^languages\.([A-Za-z0-9_-]+)\.(name|proficiency)$/u.exec(
    field.fieldPath,
  );
  if (match === null)
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  const languageKey = match[1];
  const suffix = match[2];
  if (languageKey === undefined || suffix === undefined)
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  let language = grouped.languages.get(languageKey);
  if (language === undefined) {
    language = {
      id: childIds.sectionItemId(),
      reviewStatus: field.reviewStatus,
    };
    grouped.languages.set(languageKey, language);
  }
  if (suffix === "name") {
    if (field.value.kind === "language") {
      language.name = sourcedFromField(field, field.value.name);
      if (field.value.proficiency !== undefined)
        language.proficiency = sourcedFromField(field, field.value.proficiency);
    } else if (field.value.kind === "text") {
      language.name = sourcedFromField(field, field.value.value);
    } else {
      return { ok: false as const, code: "invalid_reviewed_value" as const };
    }
  } else if (field.value.kind === "text") {
    language.proficiency = sourcedFromField(field, field.value.value);
  } else {
    return { ok: false as const, code: "invalid_reviewed_value" as const };
  }
  return { ok: true as const };
}

function appendProfessionalLink(
  field: ExtractedField,
  childIds: StructuredResumeChildIdFactory,
  content: MutableStructuredResumeContent,
) {
  if (field.value.kind !== "link")
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  content.professionalLinks.push({
    id: childIds.linkId(),
    ...(field.value.label === undefined ? {} : { label: field.value.label }),
    url: sourcedFromField(field, field.value.url),
    reviewStatus: field.reviewStatus,
  });
  return { ok: true as const };
}

function appendEducation(
  field: ExtractedField,
  childIds: StructuredResumeChildIdFactory,
  grouped: GroupedAccumulator,
) {
  const match =
    /^education\.([A-Za-z0-9_-]+)\.(institution|school|credential|field_of_study|location|start_date|end_date)$/.exec(
      field.fieldPath,
    );
  if (match === null) {
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  }
  const educationKey = match[1];
  const suffix = match[2];
  if (educationKey === undefined || suffix === undefined) {
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  }
  let education = grouped.education.get(educationKey);
  if (education === undefined) {
    education = {
      id: childIds.sectionItemId(),
      reviewStatus: field.reviewStatus,
    };
    grouped.education.set(educationKey, education);
  }
  switch (suffix) {
    case "institution":
    case "school":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      education.institution = sourcedFromField(field, field.value.value);
      break;
    case "credential":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      education.credential = sourcedFromField(field, field.value.value);
      break;
    case "field_of_study":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      education.fieldOfStudy = sourcedFromField(field, field.value.value);
      break;
    case "location":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      education.location = sourcedFromField(field, field.value.value);
      break;
    case "start_date":
      if (field.value.kind !== "date")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      education.startDate = field.value.value;
      break;
    case "end_date":
      if (field.value.kind !== "date")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      education.endDate = field.value.value;
      break;
  }
  return { ok: true as const };
}

function appendProject(
  field: ExtractedField,
  childIds: StructuredResumeChildIdFactory,
  grouped: GroupedAccumulator,
) {
  if (field.value.kind !== "text")
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  if (!["name", "description"].includes(pathSuffix(field.fieldPath))) {
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  }
  const match = /^projects\.([A-Za-z0-9_-]+)\.(name|description)$/u.exec(
    field.fieldPath,
  );
  if (match === null)
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  const projectKey = match[1];
  const suffix = match[2];
  if (projectKey === undefined || suffix === undefined)
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  let project = grouped.projects.get(projectKey);
  if (project === undefined) {
    project = {
      id: childIds.sectionItemId(),
      links: [],
      reviewStatus: field.reviewStatus,
    };
    grouped.projects.set(projectKey, project);
  }
  if (suffix === "name")
    project.name = sourcedFromField(field, field.value.value);
  else project.description = sourcedFromField(field, field.value.value);
  return { ok: true as const };
}

function appendCertification(
  field: ExtractedField,
  childIds: StructuredResumeChildIdFactory,
  grouped: GroupedAccumulator,
) {
  if (field.value.kind !== "text")
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  if (!["name", "issuer"].includes(pathSuffix(field.fieldPath))) {
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  }
  const match = /^certifications\.([A-Za-z0-9_-]+)\.(name|issuer)$/u.exec(
    field.fieldPath,
  );
  if (match === null)
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  const certificationKey = match[1];
  const suffix = match[2];
  if (certificationKey === undefined || suffix === undefined)
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  let certification = grouped.certifications.get(certificationKey);
  if (certification === undefined) {
    certification = {
      id: childIds.sectionItemId(),
      reviewStatus: field.reviewStatus,
    };
    grouped.certifications.set(certificationKey, certification);
  }
  if (suffix === "name")
    certification.name = sourcedFromField(field, field.value.value);
  else certification.issuer = sourcedFromField(field, field.value.value);
  return { ok: true as const };
}

interface GroupedAccumulator {
  readonly workExperiences: Map<string, WorkAccumulator>;
  readonly education: Map<string, EducationAccumulator>;
  readonly languages: Map<string, LanguageAccumulator>;
  readonly projects: Map<string, ProjectAccumulator>;
  readonly certifications: Map<string, CertificationAccumulator>;
}

interface WorkAccumulator {
  readonly id: string;
  employerName?: string;
  employerLocation?: string;
  readonly roles: Map<string, RoleAccumulator>;
  reviewStatus: WorkExperience["reviewStatus"];
  inferenceStatus: WorkExperience["inferenceStatus"];
}

interface RoleAccumulator {
  readonly id: string;
  title?: string;
  location?: string;
  startDate?: WorkExperienceRole["startDate"];
  endDate?: WorkExperienceRole["endDate"];
  isOngoing?: boolean;
  readonly responsibilities: SourcedText[];
  readonly achievements: SourcedText[];
  sourceStatus: WorkExperienceRole["sourceStatus"];
  reviewStatus: WorkExperienceRole["reviewStatus"];
  inferenceStatus: WorkExperienceRole["inferenceStatus"];
}

interface EducationAccumulator {
  readonly id: string;
  institution?: SourcedText;
  credential?: SourcedText;
  fieldOfStudy?: SourcedText;
  location?: SourcedText;
  startDate?: Education["startDate"];
  endDate?: Education["endDate"];
  reviewStatus: Education["reviewStatus"];
}

interface LanguageAccumulator {
  readonly id: string;
  name?: SourcedText;
  proficiency?: SourcedText;
  reviewStatus: LanguageSkill["reviewStatus"];
}

interface ProjectAccumulator {
  readonly id: string;
  name?: SourcedText;
  description?: SourcedText;
  readonly links: readonly ProfessionalLink[];
  reviewStatus: Project["reviewStatus"];
}

interface CertificationAccumulator {
  readonly id: string;
  name?: SourcedText;
  issuer?: SourcedText;
  reviewStatus: Certification["reviewStatus"];
}

function createGroupedAccumulator(): GroupedAccumulator {
  return {
    workExperiences: new Map(),
    education: new Map(),
    languages: new Map(),
    projects: new Map(),
    certifications: new Map(),
  };
}

function appendWorkExperience(
  field: ExtractedField,
  childIds: StructuredResumeChildIdFactory,
  grouped: GroupedAccumulator,
) {
  const employerMatch =
    /^work_experience\.([A-Za-z0-9_-]+)\.(employer|employer_location)$/u.exec(
      field.fieldPath,
    );
  if (employerMatch !== null) {
    const employerKey = employerMatch[1];
    const leaf = employerMatch[2];
    if (employerKey === undefined || leaf === undefined)
      return {
        ok: false as const,
        code: "unsupported_reviewed_shape" as const,
      };
    let work = grouped.workExperiences.get(employerKey);
    if (work === undefined) {
      work = {
        id: childIds.workExperienceId(),
        roles: new Map(),
        reviewStatus: field.reviewStatus,
        inferenceStatus: field.inferenceStatus,
      };
      grouped.workExperiences.set(employerKey, work);
    }
    if (field.value.kind !== "text")
      return { ok: false as const, code: "invalid_reviewed_value" as const };
    if (leaf === "employer") work.employerName = field.value.value;
    else work.employerLocation = field.value.value;
    return { ok: true as const };
  }
  const match =
    /^work_experience\.([A-Za-z0-9_-]+)\.roles\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_]+)$/.exec(
      field.fieldPath,
    );
  if (field.fieldPath === "work_experience.entry" || match === null) {
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  }
  const employerKey = match[1];
  const roleKey = match[2];
  const leaf = match[3];
  if (
    employerKey === undefined ||
    roleKey === undefined ||
    leaf === undefined
  ) {
    return { ok: false as const, code: "unsupported_reviewed_shape" as const };
  }
  let work = grouped.workExperiences.get(employerKey);
  if (work === undefined) {
    work = {
      id: childIds.workExperienceId(),
      roles: new Map(),
      reviewStatus: field.reviewStatus,
      inferenceStatus: field.inferenceStatus,
    };
    grouped.workExperiences.set(employerKey, work);
  }
  let role = work.roles.get(roleKey);
  if (role === undefined) {
    role = {
      id: childIds.workRoleId(),
      responsibilities: [],
      achievements: [],
      sourceStatus: field.sourceStatus,
      reviewStatus: field.reviewStatus,
      inferenceStatus: field.inferenceStatus,
    };
    work.roles.set(roleKey, role);
  }
  switch (leaf) {
    case "employer":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      work.employerName = field.value.value;
      break;
    case "employer_location":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      work.employerLocation = field.value.value;
      break;
    case "title":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      role.title = field.value.value;
      break;
    case "location":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      role.location = field.value.value;
      break;
    case "date_range":
      if (field.value.kind !== "date_range")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      role.startDate = field.value.startDate;
      role.endDate = field.value.endDate;
      role.isOngoing = field.value.isOngoing;
      break;
    case "responsibility":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      role.responsibilities.push(sourcedFromField(field, field.value.value));
      break;
    case "achievement":
      if (field.value.kind !== "text")
        return { ok: false as const, code: "invalid_reviewed_value" as const };
      role.achievements.push(sourcedFromField(field, field.value.value));
      break;
    default:
      return {
        ok: false as const,
        code: "unsupported_reviewed_shape" as const,
      };
  }
  return { ok: true as const };
}

function finishWorkExperiences(
  groups: Map<string, WorkAccumulator>,
): WorkExperience[] {
  return [...groups.values()]
    .filter((work) => work.employerName !== undefined)
    .map((work) => ({
      id: work.id,
      employerName: work.employerName!,
      ...(work.employerLocation === undefined
        ? {}
        : { employerLocation: work.employerLocation }),
      roles: [...work.roles.values()]
        .filter((role) => role.title !== undefined)
        .map((role) => ({
          id: role.id,
          title: role.title!,
          ...(role.location === undefined ? {} : { location: role.location }),
          ...(role.startDate === undefined
            ? {}
            : { startDate: role.startDate }),
          ...(role.endDate === undefined ? {} : { endDate: role.endDate }),
          isOngoing: role.isOngoing ?? false,
          responsibilities: role.responsibilities,
          achievements: role.achievements,
          sourceStatus: role.sourceStatus,
          reviewStatus: role.reviewStatus,
          inferenceStatus: role.inferenceStatus,
        })),
      reviewStatus: work.reviewStatus,
      inferenceStatus: work.inferenceStatus,
    }));
}

function finishEducation(
  education: Map<string, EducationAccumulator>,
): Education[] {
  return [...education.values()].flatMap((item) =>
    item.institution === undefined
      ? []
      : [
          {
            id: item.id,
            institution: item.institution,
            ...(item.credential === undefined
              ? {}
              : { credential: item.credential }),
            ...(item.fieldOfStudy === undefined
              ? {}
              : { fieldOfStudy: item.fieldOfStudy }),
            ...(item.location === undefined ? {} : { location: item.location }),
            ...(item.startDate === undefined
              ? {}
              : { startDate: item.startDate }),
            ...(item.endDate === undefined ? {} : { endDate: item.endDate }),
            reviewStatus: item.reviewStatus,
          },
        ],
  );
}

function finishLanguages(
  languages: Map<string, LanguageAccumulator>,
): LanguageSkill[] {
  return [...languages.values()].flatMap((item) =>
    item.name === undefined
      ? []
      : [
          {
            id: item.id,
            name: item.name,
            ...(item.proficiency === undefined
              ? {}
              : { proficiency: item.proficiency }),
            reviewStatus: item.reviewStatus,
          },
        ],
  );
}

function finishProjects(projects: Map<string, ProjectAccumulator>): Project[] {
  return [...projects.values()].flatMap((item) =>
    item.name === undefined
      ? []
      : [
          {
            id: item.id,
            name: item.name,
            ...(item.description === undefined
              ? {}
              : { description: item.description }),
            links: [...item.links],
            reviewStatus: item.reviewStatus,
          },
        ],
  );
}

function finishCertifications(
  certifications: Map<string, CertificationAccumulator>,
): Certification[] {
  return [...certifications.values()].flatMap((item) =>
    item.name === undefined
      ? []
      : [
          {
            id: item.id,
            name: item.name,
            ...(item.issuer === undefined ? {} : { issuer: item.issuer }),
            reviewStatus: item.reviewStatus,
          },
        ],
  );
}

function toSourcedText(field: ExtractedField): SourcedText | undefined {
  const value = textValue(field.value);
  return value === undefined ? undefined : sourcedFromField(field, value);
}

function sourcedFromField(field: ExtractedField, value: string): SourcedText {
  return {
    value,
    sourceStatus: sourceStatusForStructuredField(field),
    ...(field.sourceStatus === "user_added"
      ? {}
      : optionalSourceLocation(field.sourceLocation)),
    confidenceStatus:
      field.sourceStatus === "user_added" ||
      field.sourceStatus === "user_edited"
        ? "not_applicable"
        : field.confidenceStatus,
    inferenceStatus:
      field.sourceStatus === "user_added" ||
      field.sourceStatus === "user_edited"
        ? "not_inferred"
        : field.inferenceStatus,
  };
}

function sourceStatusForStructuredField(
  field: ExtractedField,
): FieldSourceStatus {
  if (field.sourceStatus === "user_added") return "user_added";
  if (field.reviewStatus === "edited" || field.sourceStatus === "user_edited") {
    return "user_edited";
  }
  return field.sourceStatus;
}

function optionalSourceLocation(sourceLocation: SourceLocation | undefined) {
  return sourceLocation === undefined ? {} : { sourceLocation };
}

function textValue(value: ExtractedValue): string | undefined {
  if (value.kind === "text") return value.value;
  if (value.kind === "link") return value.url;
  if (value.kind === "language") return value.name;
  return undefined;
}

function isIncludedField(field: ExtractedField): boolean {
  return (
    field.reviewStatus !== "excluded" &&
    field.inferenceStatus !== "inferred_needs_review"
  );
}

function pushWarningBlockers(
  blockers: StructuredResumeMappingBlocker[],
  warnings: readonly ImportWarning[],
): void {
  for (const warning of findUnresolvedRequiredWarnings(warnings)) {
    blockers.push({
      code: "unresolved_warning",
      section: warning.section,
      ...(warning.fieldPath === undefined
        ? {}
        : { fieldLabel: safeFieldLabel(warning.fieldPath) }),
      affectedFieldCount: 1,
    });
  }
}

function emptyContent(): MutableStructuredResumeContent {
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

function pathSuffix(fieldPath: string): string {
  const parts = fieldPath.split(".");
  return parts[parts.length - 1] ?? fieldPath;
}

function safeFieldLabel(fieldPath: string): string {
  return pathSuffix(fieldPath).replaceAll("_", " ");
}
