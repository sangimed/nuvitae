const sectionLabels: Record<string, string> = {
  personal: "Personal details",
  contact: "Contact details",
  headline: "Professional headline",
  summary: "Professional summary",
  work_experience: "Work experience",
  education: "Education",
  skills: "Skills",
  languages: "Languages",
  projects: "Projects",
  certifications: "Certifications",
  professional_links: "Professional links",
};

const fieldLabels: Record<string, string> = {
  name: "Name",
  headline: "Professional headline",
  summary: "Professional summary",
  employer: "Employer",
  title: "Job title",
  responsibility: "Responsibility",
  achievement: "Achievement",
  description: "Description",
};

export function reviewSectionLabel(section: string, fallback: string): string {
  return sectionLabels[section] ?? humanizeReviewLabel(fallback);
}

export function reviewFieldLabel(fieldPath: string): string {
  const key = fieldPath.split(".").at(-1)?.replace(/_\d+$/, "") ?? fieldPath;
  return fieldLabels[key] ?? humanizeReviewLabel(key);
}

function humanizeReviewLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
