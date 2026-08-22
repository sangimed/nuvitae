import type { ReactNode } from "react";
import type { ResumeRenderingModel, ResumeRenderingSection } from "./model";
import styles from "./ProfessionalResume.module.css";

export interface ProfessionalResumeProps {
  readonly model: ResumeRenderingModel;
}

/** Semantic, single-column resume markup shared by preview and future print/export consumers. */
export function ProfessionalResume({ model }: ProfessionalResumeProps) {
  const hasIdentity =
    model.identity.name !== undefined ||
    model.identity.headline !== undefined ||
    model.identity.details.length > 0 ||
    model.identity.links.length > 0;

  return (
    <article
      className={styles.resume}
      data-resume-template={model.template}
      dir="auto"
      aria-label="Resume"
    >
      {hasIdentity ? (
        <header className={styles.header}>
          {model.identity.name === undefined ? null : (
            <h1>{model.identity.name}</h1>
          )}
          {model.identity.headline === undefined ? null : (
            <p className={styles.headline}>{model.identity.headline}</p>
          )}
          {model.identity.details.length === 0 ? null : (
            <ul
              className={styles.inlineList}
              aria-label="Personal and contact information"
            >
              {model.identity.details.map((detail, index) => (
                <li key={`${detail}-${index}`}>{detail}</li>
              ))}
            </ul>
          )}
          <Links links={model.identity.links} label="Professional links" />
        </header>
      ) : null}
      {model.sections.map((section) => (
        <ResumeSection key={section.kind} section={section} />
      ))}
      {!hasIdentity && model.sections.length === 0 ? (
        <p className={styles.empty}>Resume content has not been added yet.</p>
      ) : null}
    </article>
  );
}

function ResumeSection({
  section,
}: {
  readonly section: ResumeRenderingSection;
}) {
  return (
    <section
      className={styles.section}
      aria-labelledby={`resume-${section.kind}`}
    >
      <h2 id={`resume-${section.kind}`}>{section.title}</h2>
      <SectionContent section={section} />
    </section>
  );
}

function SectionContent({
  section,
}: {
  readonly section: ResumeRenderingSection;
}): ReactNode {
  switch (section.kind) {
    case "summary":
      return <p>{section.text}</p>;
    case "experience":
      return section.items.map((experience) => (
        <article className={styles.entry} key={experience.id}>
          <EntryHeading
            title={experience.employer}
            {...(experience.location === undefined
              ? {}
              : { meta: experience.location })}
          />
          {experience.roles.map((role) => (
            <div className={styles.role} key={role.id}>
              <EntryHeading
                title={role.title}
                meta={[role.location, role.dates].filter(Boolean).join(" · ")}
                level="h4"
              />
              <DetailList items={role.details} />
            </div>
          ))}
        </article>
      ));
    case "education":
      return section.items.map((item) => (
        <article className={styles.entry} key={item.id}>
          <EntryHeading
            title={item.institution}
            meta={[item.location, item.dates].filter(Boolean).join(" · ")}
          />
          {item.qualification === undefined ? null : (
            <p>{item.qualification}</p>
          )}
        </article>
      ));
    case "projects":
      return section.items.map((item) => (
        <article className={styles.entry} key={item.id}>
          <EntryHeading title={item.name} />
          {item.description === undefined ? null : <p>{item.description}</p>}
          <Links links={item.links} label={`${item.name} links`} />
        </article>
      ));
    case "skills":
      return <p>{section.items.join(" • ")}</p>;
    case "certifications":
      return section.items.map((item) => (
        <article className={styles.entry} key={item.id}>
          <EntryHeading
            title={item.name}
            meta={[item.issuer, item.dates].filter(Boolean).join(" · ")}
          />
        </article>
      ));
    case "languages":
      return (
        <ul className={styles.plainList}>
          {section.items.map((item) => (
            <li key={item.id}>
              {item.name}
              {item.proficiency === undefined ? null : ` — ${item.proficiency}`}
            </li>
          ))}
        </ul>
      );
  }
}

function EntryHeading(props: {
  readonly title: string;
  readonly meta?: string;
  readonly level?: "h4";
}) {
  const content = <>{props.title}</>;
  return (
    <div className={styles.entryHeading}>
      {props.level === "h4" ? <h4>{content}</h4> : <h3>{content}</h3>}
      {props.meta === undefined || props.meta === "" ? null : (
        <p>{props.meta}</p>
      )}
    </div>
  );
}

function DetailList({ items }: { readonly items: readonly string[] }) {
  return items.length === 0 ? null : (
    <ul>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function Links(props: {
  readonly links: readonly { readonly label: string; readonly url: string }[];
  readonly label: string;
}) {
  return props.links.length === 0 ? null : (
    <ul className={styles.inlineList} aria-label={props.label}>
      {props.links.map((link, index) => (
        <li key={`${link.url}-${index}`}>
          {safeWebUrl(link.url) ? (
            <a href={link.url}>{link.label}</a>
          ) : (
            link.label
          )}
        </li>
      ))}
    </ul>
  );
}

function safeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
