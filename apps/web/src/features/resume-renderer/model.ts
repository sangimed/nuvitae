import type { ResumeDateContract } from "@nuvitae/contracts";

interface RenderableText {
  readonly value: string;
}

interface RenderableLink {
  readonly label?: string | undefined;
  readonly url: RenderableText;
}

/** The canonical resume fields used by the first template, independent of React or PDF. */
export interface CanonicalResumeForRendering {
  readonly personal: readonly RenderableText[];
  readonly contact: readonly RenderableText[];
  readonly headline?: RenderableText | undefined;
  readonly summary?: RenderableText | undefined;
  readonly workExperiences: readonly {
    readonly id: string;
    readonly employerName: string;
    readonly employerLocation?: string | undefined;
    readonly roles: readonly {
      readonly id: string;
      readonly title: string;
      readonly location?: string | undefined;
      readonly startDate?: ResumeDateContract | undefined;
      readonly endDate?: ResumeDateContract | undefined;
      readonly isOngoing: boolean;
      readonly responsibilities: readonly RenderableText[];
      readonly achievements: readonly RenderableText[];
    }[];
  }[];
  readonly education: readonly {
    readonly id: string;
    readonly institution: RenderableText;
    readonly credential?: RenderableText | undefined;
    readonly fieldOfStudy?: RenderableText | undefined;
    readonly location?: RenderableText | undefined;
    readonly startDate?: ResumeDateContract | undefined;
    readonly endDate?: ResumeDateContract | undefined;
  }[];
  readonly skills: readonly {
    readonly id: string;
    readonly name: RenderableText;
  }[];
  readonly languages: readonly {
    readonly id: string;
    readonly name: RenderableText;
    readonly proficiency?: RenderableText | undefined;
  }[];
  readonly projects: readonly {
    readonly id: string;
    readonly name: RenderableText;
    readonly description?: RenderableText | undefined;
    readonly links: readonly RenderableLink[];
  }[];
  readonly certifications: readonly {
    readonly id: string;
    readonly name: RenderableText;
    readonly issuer?: RenderableText | undefined;
    readonly issuedAt?: ResumeDateContract | undefined;
    readonly expiresAt?: ResumeDateContract | undefined;
  }[];
  readonly professionalLinks: readonly RenderableLink[];
}

export interface ResumeRenderingModel {
  readonly template: "professional";
  readonly identity: {
    readonly name?: string;
    readonly headline?: string;
    readonly details: readonly string[];
    readonly links: readonly { readonly label: string; readonly url: string }[];
  };
  readonly sections: readonly ResumeRenderingSection[];
}

export type ResumeRenderingSection =
  | {
      readonly kind: "summary";
      readonly title: "Professional Summary";
      readonly text: string;
    }
  | {
      readonly kind: "experience";
      readonly title: "Experience";
      readonly items: readonly RenderedExperience[];
    }
  | {
      readonly kind: "education";
      readonly title: "Education";
      readonly items: readonly RenderedEducation[];
    }
  | {
      readonly kind: "projects";
      readonly title: "Projects";
      readonly items: readonly RenderedProject[];
    }
  | {
      readonly kind: "skills";
      readonly title: "Skills";
      readonly items: readonly string[];
    }
  | {
      readonly kind: "certifications";
      readonly title: "Certifications";
      readonly items: readonly RenderedCertification[];
    }
  | {
      readonly kind: "languages";
      readonly title: "Languages";
      readonly items: readonly RenderedLanguage[];
    };

interface RenderedExperience {
  readonly id: string;
  readonly employer: string;
  readonly location?: string;
  readonly roles: readonly {
    readonly id: string;
    readonly title: string;
    readonly location?: string;
    readonly dates?: string;
    readonly details: readonly string[];
  }[];
}

interface RenderedEducation {
  readonly id: string;
  readonly institution: string;
  readonly qualification?: string;
  readonly location?: string;
  readonly dates?: string;
}

interface RenderedProject {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly links: readonly { readonly label: string; readonly url: string }[];
}

interface RenderedCertification {
  readonly id: string;
  readonly name: string;
  readonly issuer?: string;
  readonly dates?: string;
}

interface RenderedLanguage {
  readonly id: string;
  readonly name: string;
  readonly proficiency?: string;
}

/**
 * Builds the shared, deterministic model consumed by visual and export renderers.
 * Empty canonical values are omitted rather than replaced with invented content.
 */
export function createResumeRenderingModel(
  resume: CanonicalResumeForRendering,
): ResumeRenderingModel {
  const personal = texts(resume.personal);
  const summary = text(resume.summary);
  const experience = resume.workExperiences
    .map((item) => ({
      id: item.id,
      employer: clean(item.employerName),
      ...optional("location", item.employerLocation),
      roles: item.roles
        .map((role) => ({
          id: role.id,
          title: clean(role.title),
          ...optional("location", role.location),
          ...optional(
            "dates",
            formatDateRange(role.startDate, role.endDate, role.isOngoing),
          ),
          details: [
            ...texts(role.responsibilities),
            ...texts(role.achievements),
          ],
        }))
        .filter((role) => role.title !== "" || role.details.length > 0),
    }))
    .filter((item) => item.employer !== "" || item.roles.length > 0);
  const education = resume.education
    .map((item) => ({
      id: item.id,
      institution: text(item.institution) ?? "",
      ...optional(
        "qualification",
        [text(item.credential), text(item.fieldOfStudy)]
          .filter(isPresent)
          .join(", "),
      ),
      ...optional("location", text(item.location)),
      ...optional("dates", formatDateRange(item.startDate, item.endDate)),
    }))
    .filter((item) => item.institution !== "");
  const projects = resume.projects
    .map((item): RenderedProject => {
      const description = text(item.description);
      return {
        id: item.id,
        name: text(item.name) ?? "",
        ...optional("description", description),
        links: links(item.links),
      };
    })
    .filter((item) => item.name !== "" || item.description !== undefined);
  const skills = resume.skills.map((item) => text(item.name)).filter(isPresent);
  const certifications = resume.certifications
    .map((item) => ({
      id: item.id,
      name: text(item.name) ?? "",
      ...optional("issuer", text(item.issuer)),
      ...optional("dates", formatDateRange(item.issuedAt, item.expiresAt)),
    }))
    .filter((item) => item.name !== "");
  const languages = resume.languages
    .map((item) => ({
      id: item.id,
      name: text(item.name) ?? "",
      ...optional("proficiency", text(item.proficiency)),
    }))
    .filter((item) => item.name !== "");

  const sections: ResumeRenderingSection[] = [];
  if (summary !== undefined)
    sections.push({
      kind: "summary",
      title: "Professional Summary",
      text: summary,
    });
  if (experience.length > 0)
    sections.push({
      kind: "experience",
      title: "Experience",
      items: experience,
    });
  if (education.length > 0)
    sections.push({ kind: "education", title: "Education", items: education });
  if (projects.length > 0)
    sections.push({ kind: "projects", title: "Projects", items: projects });
  if (skills.length > 0)
    sections.push({ kind: "skills", title: "Skills", items: skills });
  if (certifications.length > 0)
    sections.push({
      kind: "certifications",
      title: "Certifications",
      items: certifications,
    });
  if (languages.length > 0)
    sections.push({ kind: "languages", title: "Languages", items: languages });

  return {
    template: "professional",
    identity: {
      ...optional("name", personal[0]),
      ...optional("headline", text(resume.headline)),
      details: [...personal.slice(1), ...texts(resume.contact)],
      links: links(resume.professionalLinks),
    },
    sections,
  };
}

function text(value: RenderableText | undefined): string | undefined {
  const cleaned = clean(value?.value);
  return cleaned === "" ? undefined : cleaned;
}

function texts(values: readonly RenderableText[]): string[] {
  return values.map((value) => text(value)).filter(isPresent);
}

function links(values: readonly RenderableLink[]) {
  return values
    .map((value) => {
      const url = text(value.url) ?? "";
      return { label: clean(value.label) || url, url };
    })
    .filter((value) => value.url !== "");
}

function clean(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function optional<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
) {
  return value === undefined || value === ""
    ? {}
    : ({ [key]: value } as Record<Key, Value>);
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function formatDateRange(
  start: ResumeDateContract | undefined,
  end: ResumeDateContract | undefined,
  ongoing = false,
): string | undefined {
  const startText = start === undefined ? undefined : formatDate(start);
  const endText =
    end === undefined ? (ongoing ? "Present" : undefined) : formatDate(end);
  if (startText !== undefined && endText !== undefined)
    return `${startText} – ${endText}`;
  return startText ?? endText;
}

function formatDate(value: ResumeDateContract): string {
  if (value.precision === "present") return value.originalText ?? "Present";
  if (value.precision === "month") {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(value.year, value.month - 1, 1)));
  }
  return String(value.year);
}
