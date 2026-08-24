import type {
  ConfirmedStructuredResumeReadResponse,
  StructuredResumeContentContract,
} from "@nuvitae/contracts";

type ConfirmedContent = ConfirmedStructuredResumeReadResponse["content"];
type ConfirmedText = ConfirmedContent["personal"][number];

const editableText = (
  text: ConfirmedText,
): StructuredResumeContentContract["personal"][number] => ({
  value: text.value,
  sourceStatus: "user_added",
  confidenceStatus: "not_applicable",
  inferenceStatus: "not_inferred",
});

export function toEditableResumeContent(
  content: ConfirmedContent,
): StructuredResumeContentContract {
  return {
    ...(content.sectionOrder === undefined
      ? {}
      : { sectionOrder: [...content.sectionOrder] }),
    personal: content.personal.map(editableText),
    contact: content.contact.map(editableText),
    ...(content.headline === undefined
      ? {}
      : { headline: editableText(content.headline) }),
    ...(content.summary === undefined
      ? {}
      : { summary: editableText(content.summary) }),
    workExperiences: content.workExperiences.map((experience) => ({
      ...experience,
      reviewStatus: "edited",
      inferenceStatus: "not_inferred",
      roles: experience.roles.map((role) => ({
        ...role,
        responsibilities: role.responsibilities.map(editableText),
        achievements: role.achievements.map(editableText),
        sourceStatus: "user_added",
        reviewStatus: "edited",
        inferenceStatus: "not_inferred",
      })),
    })),
    education: content.education.map((item) => ({
      id: item.id,
      institution: editableText(item.institution),
      ...(item.credential === undefined
        ? {}
        : { credential: editableText(item.credential) }),
      ...(item.fieldOfStudy === undefined
        ? {}
        : { fieldOfStudy: editableText(item.fieldOfStudy) }),
      ...(item.location === undefined
        ? {}
        : { location: editableText(item.location) }),
      ...(item.startDate === undefined ? {} : { startDate: item.startDate }),
      ...(item.endDate === undefined ? {} : { endDate: item.endDate }),
      reviewStatus: "edited",
    })),
    skills: content.skills.map((item) => ({
      id: item.id,
      name: editableText(item.name),
      ...(item.category === undefined ? {} : { category: item.category }),
      reviewStatus: "edited",
    })),
    languages: content.languages.map((item) => ({
      id: item.id,
      name: editableText(item.name),
      ...(item.proficiency === undefined
        ? {}
        : { proficiency: editableText(item.proficiency) }),
      reviewStatus: "edited",
    })),
    projects: content.projects.map((item) => ({
      id: item.id,
      name: editableText(item.name),
      ...(item.description === undefined
        ? {}
        : { description: editableText(item.description) }),
      links: item.links.map((link) => ({
        id: link.id,
        ...(link.label === undefined ? {} : { label: link.label }),
        url: editableText(link.url),
        reviewStatus: "edited",
      })),
      reviewStatus: "edited",
    })),
    certifications: content.certifications.map((item) => ({
      id: item.id,
      name: editableText(item.name),
      ...(item.issuer === undefined
        ? {}
        : { issuer: editableText(item.issuer) }),
      ...(item.issuedAt === undefined ? {} : { issuedAt: item.issuedAt }),
      ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt }),
      reviewStatus: "edited",
    })),
    professionalLinks: content.professionalLinks.map((link) => ({
      id: link.id,
      ...(link.label === undefined ? {} : { label: link.label }),
      url: editableText(link.url),
      reviewStatus: "edited",
    })),
  };
}
