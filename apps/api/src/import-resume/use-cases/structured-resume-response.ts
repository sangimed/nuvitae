import type {
  SourceLocation,
  SourcedText,
  StructuredResumeContent,
} from "@nuvitae/domain";

/** Serializes canonical content without exposing private source coordinates. */
export function toPublicStructuredResumeContent(
  content: StructuredResumeContent,
) {
  const text = (value: SourcedText) => ({
    value: value.value,
    sourceStatus:
      value.sourceStatus === "inferred"
        ? ("explicit_source" as const)
        : value.sourceStatus,
    confidenceStatus: value.confidenceStatus,
    inferenceStatus:
      value.inferenceStatus === "inferred_needs_review"
        ? ("confirmed_inference" as const)
        : value.inferenceStatus,
    provenance: safeProvenance(value),
  });
  return {
    ...(content.sectionOrder === undefined
      ? {}
      : { sectionOrder: [...content.sectionOrder] }),
    personal: content.personal.map(text),
    contact: content.contact.map(text),
    ...(content.headline === undefined
      ? {}
      : { headline: text(content.headline) }),
    ...(content.summary === undefined
      ? {}
      : { summary: text(content.summary) }),
    workExperiences: content.workExperiences.map((experience) => ({
      id: experience.id,
      employerName: experience.employerName,
      ...(experience.employerLocation === undefined
        ? {}
        : { employerLocation: experience.employerLocation }),
      roles: experience.roles.map((role) => ({
        id: role.id,
        title: role.title,
        ...(role.location === undefined ? {} : { location: role.location }),
        ...(role.startDate === undefined ? {} : { startDate: role.startDate }),
        ...(role.endDate === undefined ? {} : { endDate: role.endDate }),
        isOngoing: role.isOngoing,
        responsibilities: role.responsibilities.map(text),
        achievements: role.achievements.map(text),
      })),
    })),
    education: content.education.map((item) => ({
      id: item.id,
      institution: text(item.institution),
      ...(item.credential === undefined
        ? {}
        : { credential: text(item.credential) }),
      ...(item.fieldOfStudy === undefined
        ? {}
        : { fieldOfStudy: text(item.fieldOfStudy) }),
      ...(item.location === undefined ? {} : { location: text(item.location) }),
      ...(item.startDate === undefined ? {} : { startDate: item.startDate }),
      ...(item.endDate === undefined ? {} : { endDate: item.endDate }),
    })),
    skills: content.skills.map((item) => ({
      id: item.id,
      name: text(item.name),
      ...(item.category === undefined ? {} : { category: item.category }),
    })),
    languages: content.languages.map((item) => ({
      id: item.id,
      name: text(item.name),
      ...(item.proficiency === undefined
        ? {}
        : { proficiency: text(item.proficiency) }),
    })),
    projects: content.projects.map((item) => ({
      id: item.id,
      name: text(item.name),
      ...(item.description === undefined
        ? {}
        : { description: text(item.description) }),
      links: item.links.map((link) => ({
        id: link.id,
        ...(link.label === undefined ? {} : { label: link.label }),
        url: text(link.url),
      })),
    })),
    certifications: content.certifications.map((item) => ({
      id: item.id,
      name: text(item.name),
      ...(item.issuer === undefined ? {} : { issuer: text(item.issuer) }),
      ...(item.issuedAt === undefined ? {} : { issuedAt: item.issuedAt }),
      ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt }),
    })),
    professionalLinks: content.professionalLinks.map((link) => ({
      id: link.id,
      ...(link.label === undefined ? {} : { label: link.label }),
      url: text(link.url),
    })),
  };
}

function safeProvenance(value: SourcedText) {
  if (value.sourceStatus === "user_added")
    return { kind: "user_added" as const };
  if (value.sourceStatus === "user_edited") {
    return {
      kind: "user_edited" as const,
      ...(value.sourceLocation === undefined
        ? {}
        : { original: sourceLocationToPublic(value.sourceLocation) }),
    };
  }
  if (value.sourceLocation === undefined) {
    return {
      kind: "minimal" as const,
      label: "imported_from_initial_resume" as const,
    };
  }
  return sourceLocationToPublic(value.sourceLocation);
}

function sourceLocationToPublic(location: SourceLocation) {
  if (location.kind === "pdf")
    return { kind: "pdf" as const, pageNumber: location.pageNumber };
  if (location.kind === "docx") {
    return {
      kind: "docx" as const,
      documentPart: location.packagePart.includes("/header")
        ? "header"
        : location.packagePart.includes("/footer")
          ? "footer"
          : "body",
      paragraphNumber: location.paragraphIndex + 1,
    };
  }
  if (location.kind === "semantic") {
    return {
      kind: "semantic" as const,
      evidence: location.evidence.map((item) => ({
        fragmentId: item.fragmentId,
        fragmentHash: item.fragmentHash,
        line: item.line,
        start: item.start,
        end: item.end,
      })),
    };
  }
  return {
    kind: "minimal" as const,
    label: "imported_from_initial_resume" as const,
  };
}
