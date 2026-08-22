"use client";

import type {
  StructuredResumeContentContract,
  resumeEditorSectionIds,
} from "@nuvitae/contracts";
import { createBrowserUuid } from "../../services/browser-ids";
import { formatResumeDate } from "./date";

type Content = StructuredResumeContentContract;
type TextValue = Content["personal"][number];
type WorkExperience = Content["workExperiences"][number];
type WorkRole = WorkExperience["roles"][number];
type Education = Content["education"][number];
type Skill = Content["skills"][number];
type Language = Content["languages"][number];
type Project = Content["projects"][number];
type Certification = Content["certifications"][number];
type Link = Content["professionalLinks"][number];
export type ResumeEditorSectionId = (typeof resumeEditorSectionIds)[number];

export interface StructuredResumeSectionsProps {
  readonly value: Content;
  readonly onChange: (value: Content) => void;
  readonly mode: "manual" | "import_review";
  readonly validationErrors?: Readonly<Record<string, string>> | undefined;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly activeSection?: ResumeEditorSectionId | undefined;
}

export function StructuredResumeSections(props: StructuredResumeSectionsProps) {
  const disabled = props.disabled === true || props.readOnly === true;
  const set = (next: Partial<Content>) =>
    props.onChange({ ...props.value, ...next });
  const shows = (section: ResumeEditorSectionId) =>
    props.activeSection === undefined || props.activeSection === section;

  return (
    <div className="resume-editor" data-mode={props.mode}>
      {shows("basics") ? (
        <section
          className="editor-section-group"
          aria-labelledby="basics-title"
        >
          <h2 id="basics-title">Basics</h2>
          <TextListSection
            title="Personal information"
            field="personal"
            values={props.value.personal}
            label="Personal detail"
            disabled={disabled}
            errors={props.validationErrors}
            onChange={(personal) => set({ personal })}
          />
          <TextListSection
            title="Contact information"
            field="contact"
            values={props.value.contact}
            label="Contact detail"
            disabled={disabled}
            errors={props.validationErrors}
            onChange={(contact) => set({ contact })}
          />
          <section
            className="editor-section"
            aria-labelledby="headline-section"
          >
            <h3 id="headline-section">Headline</h3>
            <TextField
              id="headline"
              label="Professional headline"
              value={props.value.headline?.value ?? ""}
              disabled={disabled}
              error={props.validationErrors?.headline}
              onChange={(value) =>
                set({
                  headline: value.trim() === "" ? undefined : manualText(value),
                })
              }
            />
          </section>
        </section>
      ) : null}

      {shows("summary") ? (
        <section className="editor-section" aria-labelledby="summary-section">
          <h2 id="summary-section">Summary</h2>
          <TextArea
            id="summary"
            label="Professional summary"
            value={props.value.summary?.value ?? ""}
            disabled={disabled}
            error={props.validationErrors?.summary}
            onChange={(value) =>
              set({
                summary: value.trim() === "" ? undefined : manualText(value),
              })
            }
          />
        </section>
      ) : null}

      {shows("workExperiences") ? (
        <WorkSection
          values={props.value.workExperiences}
          disabled={disabled}
          errors={props.validationErrors}
          onChange={(workExperiences) => set({ workExperiences })}
        />
      ) : null}
      {shows("education") ? (
        <EducationSection
          values={props.value.education}
          disabled={disabled}
          errors={props.validationErrors}
          onChange={(education) => set({ education })}
        />
      ) : null}
      {shows("skills") ? (
        <SkillSection
          values={props.value.skills}
          disabled={disabled}
          errors={props.validationErrors}
          onChange={(skills) => set({ skills })}
        />
      ) : null}
      {shows("languages") ? (
        <LanguageSection
          values={props.value.languages}
          disabled={disabled}
          errors={props.validationErrors}
          onChange={(languages) => set({ languages })}
        />
      ) : null}
      {shows("projects") ? (
        <ProjectSection
          values={props.value.projects}
          disabled={disabled}
          errors={props.validationErrors}
          onChange={(projects) => set({ projects })}
        />
      ) : null}
      {shows("certifications") ? (
        <CertificationSection
          values={props.value.certifications}
          disabled={disabled}
          errors={props.validationErrors}
          onChange={(certifications) => set({ certifications })}
        />
      ) : null}
      {shows("professionalLinks") ? (
        <LinkSection
          title="Professional links"
          field="professionalLinks"
          values={props.value.professionalLinks}
          disabled={disabled}
          errors={props.validationErrors}
          onChange={(professionalLinks) => set({ professionalLinks })}
        />
      ) : null}
    </div>
  );
}

function TextListSection(props: {
  readonly title: string;
  readonly field: "personal" | "contact";
  readonly label: string;
  readonly values: readonly TextValue[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (values: TextValue[]) => void;
}) {
  return (
    <section
      className="editor-section"
      aria-labelledby={`${props.field}-section`}
    >
      <h2 id={`${props.field}-section`}>{props.title}</h2>
      {props.values.map((item, index) => (
        <fieldset className="repeatable-group" key={`${props.field}-${index}`}>
          <legend>{`${props.label} ${index + 1}`}</legend>
          <TextField
            id={`${props.field}-${index}`}
            label={props.label}
            value={item.value}
            disabled={props.disabled}
            error={props.errors?.[`${props.field}.${index}`]}
            onChange={(value) =>
              props.onChange(replaceAt(props.values, index, manualText(value)))
            }
          />
          <RemoveButton
            label={`Remove ${props.label.toLowerCase()} ${index + 1}`}
            disabled={props.disabled}
            onClick={() => props.onChange(removeAt(props.values, index))}
          />
        </fieldset>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, manualText("")])}
      >
        Add {props.label.toLowerCase()}
      </button>
    </section>
  );
}

function WorkSection(props: {
  readonly values: readonly WorkExperience[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (values: WorkExperience[]) => void;
}) {
  return (
    <section className="editor-section" aria-labelledby="work-section">
      <h2 id="work-section">Work experience</h2>
      {props.values.map((experience, index) => (
        <fieldset className="repeatable-group" key={experience.id}>
          <legend>{`Employer ${index + 1}`}</legend>
          <TextField
            id={`work-${experience.id}-employer`}
            label="Employer"
            value={experience.employerName}
            disabled={props.disabled}
            error={props.errors?.[`workExperiences.${index}.employerName`]}
            onChange={(employerName) =>
              props.onChange(
                replaceAt(props.values, index, { ...experience, employerName }),
              )
            }
          />
          <TextField
            id={`work-${experience.id}-location`}
            label="Employer location"
            value={experience.employerLocation ?? ""}
            disabled={props.disabled}
            onChange={(employerLocation) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...experience,
                  ...(employerLocation.trim() === ""
                    ? {}
                    : { employerLocation }),
                }),
              )
            }
          />
          {experience.roles.map((role, roleIndex) => (
            <fieldset className="nested-group" key={role.id}>
              <legend>{`Role ${roleIndex + 1}`}</legend>
              <RoleEditor
                role={role}
                path={`workExperiences.${index}.roles.${roleIndex}`}
                disabled={props.disabled}
                errors={props.errors}
                onChange={(nextRole) =>
                  props.onChange(
                    replaceAt(props.values, index, {
                      ...experience,
                      roles: replaceAt(experience.roles, roleIndex, nextRole),
                    }),
                  )
                }
              />
              <MoveButtons
                label="role"
                disabled={props.disabled}
                index={roleIndex}
                count={experience.roles.length}
                onMove={(target) =>
                  props.onChange(
                    replaceAt(props.values, index, {
                      ...experience,
                      roles: moveAt(experience.roles, roleIndex, target),
                    }),
                  )
                }
              />
              <RemoveButton
                label={`Remove role ${roleIndex + 1}`}
                disabled={props.disabled}
                onClick={() =>
                  props.onChange(
                    replaceAt(props.values, index, {
                      ...experience,
                      roles: removeAt(experience.roles, roleIndex),
                    }),
                  )
                }
              />
            </fieldset>
          ))}
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              disabled={props.disabled}
              onClick={() =>
                props.onChange(
                  replaceAt(props.values, index, {
                    ...experience,
                    roles: [...experience.roles, blankRole()],
                  }),
                )
              }
            >
              Add role
            </button>
            <MoveButtons
              label="employer"
              disabled={props.disabled}
              index={index}
              count={props.values.length}
              onMove={(target) =>
                props.onChange(moveAt(props.values, index, target))
              }
            />
            <RemoveButton
              label={`Remove employer ${index + 1}`}
              disabled={props.disabled}
              onClick={() => props.onChange(removeAt(props.values, index))}
            />
          </div>
        </fieldset>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, blankWorkExperience()])}
      >
        Add work experience
      </button>
    </section>
  );
}

function RoleEditor(props: {
  readonly role: WorkRole;
  readonly path: string;
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (role: WorkRole) => void;
}) {
  return (
    <div className="editor-grid">
      <TextField
        id={`${props.role.id}-title`}
        label="Role title"
        value={props.role.title}
        disabled={props.disabled}
        error={props.errors?.[`${props.path}.title`]}
        onChange={(title) => props.onChange({ ...props.role, title })}
      />
      <TextField
        id={`${props.role.id}-role-location`}
        label="Role location"
        value={props.role.location ?? ""}
        disabled={props.disabled}
        onChange={(location) =>
          props.onChange({
            ...props.role,
            ...(location.trim() === "" ? {} : { location }),
          })
        }
      />
      <TextField
        id={`${props.role.id}-start`}
        label="Start date"
        value={
          props.role.startDate === undefined
            ? ""
            : formatResumeDate(props.role.startDate)
        }
        disabled={props.disabled}
        onChange={(year) =>
          props.onChange({ ...props.role, startDate: parseYear(year) })
        }
      />
      <TextField
        id={`${props.role.id}-end`}
        label="End date"
        value={
          props.role.isOngoing
            ? "Present"
            : props.role.endDate === undefined
              ? ""
              : formatResumeDate(props.role.endDate)
        }
        disabled={props.disabled || props.role.isOngoing}
        error={props.errors?.[`${props.path}.endDate`]}
        onChange={(year) =>
          props.onChange({ ...props.role, endDate: parseYear(year) })
        }
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={props.role.isOngoing}
          disabled={props.disabled}
          onChange={(event) =>
            props.onChange({
              ...props.role,
              isOngoing: event.currentTarget.checked,
              ...(event.currentTarget.checked ? { endDate: undefined } : {}),
            })
          }
        />
        Ongoing role
      </label>
      <TextArrayEditor
        label="responsibility"
        values={props.role.responsibilities}
        disabled={props.disabled}
        onChange={(responsibilities) =>
          props.onChange({ ...props.role, responsibilities })
        }
      />
      <TextArrayEditor
        label="achievement"
        values={props.role.achievements}
        disabled={props.disabled}
        onChange={(achievements) =>
          props.onChange({ ...props.role, achievements })
        }
      />
    </div>
  );
}

function EducationSection(props: {
  readonly values: readonly Education[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (values: Education[]) => void;
}) {
  return (
    <section className="editor-section" aria-labelledby="education-section">
      <h2 id="education-section">Education</h2>
      {props.values.map((item, index) => (
        <fieldset className="repeatable-group" key={item.id}>
          <legend>{`Education ${index + 1}`}</legend>
          <TextField
            id={`${item.id}-school`}
            label="School"
            value={item.institution.value}
            disabled={props.disabled}
            error={props.errors?.[`education.${index}.institution`]}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  institution: manualText(value),
                }),
              )
            }
          />
          <TextField
            id={`${item.id}-credential`}
            label="Credential"
            value={item.credential?.value ?? ""}
            disabled={props.disabled}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  credential: optionalManualText(value),
                }),
              )
            }
          />
          <TextField
            id={`${item.id}-field`}
            label="Field of study"
            value={item.fieldOfStudy?.value ?? ""}
            disabled={props.disabled}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  fieldOfStudy: optionalManualText(value),
                }),
              )
            }
          />
          <RemoveButton
            label={`Remove education ${index + 1}`}
            disabled={props.disabled}
            onClick={() => props.onChange(removeAt(props.values, index))}
          />
        </fieldset>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, blankEducation()])}
      >
        Add education
      </button>
    </section>
  );
}

function SkillSection(props: {
  readonly values: readonly Skill[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (values: Skill[]) => void;
}) {
  return (
    <SimpleNamedSection
      title="Skills"
      field="skills"
      values={props.values}
      disabled={props.disabled}
      errors={props.errors}
      create={blankSkill}
      getName={(item) => item.name.value}
      setName={(item, value) => ({ ...item, name: manualText(value) })}
      onChange={props.onChange}
    />
  );
}

function LanguageSection(props: {
  readonly values: readonly Language[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (values: Language[]) => void;
}) {
  return (
    <section className="editor-section" aria-labelledby="languages-section">
      <h2 id="languages-section">Languages</h2>
      {props.values.map((item, index) => (
        <fieldset className="repeatable-group" key={item.id}>
          <legend>{`Language ${index + 1}`}</legend>
          <TextField
            id={`${item.id}-language`}
            label="Language"
            value={item.name.value}
            disabled={props.disabled}
            error={props.errors?.[`languages.${index}.name`]}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  name: manualText(value),
                }),
              )
            }
          />
          <TextField
            id={`${item.id}-proficiency`}
            label="Proficiency"
            value={item.proficiency?.value ?? ""}
            disabled={props.disabled}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  proficiency: optionalManualText(value),
                }),
              )
            }
          />
          <RemoveButton
            label={`Remove language ${index + 1}`}
            disabled={props.disabled}
            onClick={() => props.onChange(removeAt(props.values, index))}
          />
        </fieldset>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, blankLanguage()])}
      >
        Add language
      </button>
    </section>
  );
}

function ProjectSection(props: {
  readonly values: readonly Project[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (values: Project[]) => void;
}) {
  return (
    <section className="editor-section" aria-labelledby="projects-section">
      <h2 id="projects-section">Projects</h2>
      {props.values.map((item, index) => (
        <fieldset className="repeatable-group" key={item.id}>
          <legend>{`Project ${index + 1}`}</legend>
          <TextField
            id={`${item.id}-project`}
            label="Project name"
            value={item.name.value}
            disabled={props.disabled}
            error={props.errors?.[`projects.${index}.name`]}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  name: manualText(value),
                }),
              )
            }
          />
          <TextArea
            id={`${item.id}-description`}
            label="Project description"
            value={item.description?.value ?? ""}
            disabled={props.disabled}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  description: optionalManualText(value),
                }),
              )
            }
          />
          <LinkSection
            title="Project links"
            field={`projects.${index}.links`}
            values={item.links}
            disabled={props.disabled}
            errors={props.errors}
            onChange={(links) =>
              props.onChange(replaceAt(props.values, index, { ...item, links }))
            }
          />
          <RemoveButton
            label={`Remove project ${index + 1}`}
            disabled={props.disabled}
            onClick={() => props.onChange(removeAt(props.values, index))}
          />
        </fieldset>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, blankProject()])}
      >
        Add project
      </button>
    </section>
  );
}

function CertificationSection(props: {
  readonly values: readonly Certification[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (values: Certification[]) => void;
}) {
  return (
    <section
      className="editor-section"
      aria-labelledby="certifications-section"
    >
      <h2 id="certifications-section">Certifications</h2>
      {props.values.map((item, index) => (
        <fieldset className="repeatable-group" key={item.id}>
          <legend>{`Certification ${index + 1}`}</legend>
          <TextField
            id={`${item.id}-cert`}
            label="Certification"
            value={item.name.value}
            disabled={props.disabled}
            error={props.errors?.[`certifications.${index}.name`]}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  name: manualText(value),
                }),
              )
            }
          />
          <TextField
            id={`${item.id}-issuer`}
            label="Issuer"
            value={item.issuer?.value ?? ""}
            disabled={props.disabled}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  issuer: optionalManualText(value),
                }),
              )
            }
          />
          <RemoveButton
            label={`Remove certification ${index + 1}`}
            disabled={props.disabled}
            onClick={() => props.onChange(removeAt(props.values, index))}
          />
        </fieldset>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, blankCertification()])}
      >
        Add certification
      </button>
    </section>
  );
}

function LinkSection(props: {
  readonly title: string;
  readonly field: string;
  readonly values: readonly Link[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly onChange: (values: Link[]) => void;
}) {
  return (
    <section
      className="editor-subsection"
      aria-labelledby={`${props.field}-section`}
    >
      <h3 id={`${props.field}-section`}>{props.title}</h3>
      {props.values.map((item, index) => (
        <fieldset className="repeatable-group" key={item.id}>
          <legend>{`Link ${index + 1}`}</legend>
          <TextField
            id={`${item.id}-label`}
            label="Link label"
            value={item.label ?? ""}
            disabled={props.disabled}
            onChange={(label) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  ...(label.trim() === "" ? {} : { label }),
                }),
              )
            }
          />
          <TextField
            id={`${item.id}-url`}
            label="URL"
            value={item.url.value}
            disabled={props.disabled}
            error={props.errors?.[`${props.field}.${index}.url`]}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, {
                  ...item,
                  url: manualText(value),
                }),
              )
            }
          />
          <RemoveButton
            label={`Remove link ${index + 1}`}
            disabled={props.disabled}
            onClick={() => props.onChange(removeAt(props.values, index))}
          />
        </fieldset>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, blankLink()])}
      >
        Add link
      </button>
    </section>
  );
}

function SimpleNamedSection<T extends { readonly id: string }>(props: {
  readonly title: string;
  readonly field: string;
  readonly values: readonly T[];
  readonly disabled: boolean;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly create: () => T;
  readonly getName: (item: T) => string;
  readonly setName: (item: T, value: string) => T;
  readonly onChange: (values: T[]) => void;
}) {
  const addButtonId = `add-${props.field}`;
  return (
    <section
      className="editor-section"
      aria-labelledby={`${props.field}-section`}
    >
      <h2 id={`${props.field}-section`}>{props.title}</h2>
      {props.values.map((item, index) => (
        <fieldset className="repeatable-group" key={item.id}>
          <legend>{`${props.title.slice(0, -1)} ${index + 1}`}</legend>
          <TextField
            id={`${item.id}-name`}
            label="Name"
            value={props.getName(item)}
            disabled={props.disabled}
            error={props.errors?.[`${props.field}.${index}.name`]}
            onChange={(value) =>
              props.onChange(
                replaceAt(props.values, index, props.setName(item, value)),
              )
            }
          />
          <MoveButtons
            label={props.title.toLowerCase()}
            disabled={props.disabled}
            index={index}
            count={props.values.length}
            onMove={(target) =>
              props.onChange(moveAt(props.values, index, target))
            }
          />
          <RemoveButton
            label={`Remove ${props.title.toLowerCase()} ${index + 1}`}
            disabled={props.disabled}
            onClick={() => {
              const next = removeAt(props.values, index);
              props.onChange(next);
              const surviving = next[Math.min(index, next.length - 1)];
              focusAfterUpdate(
                surviving === undefined ? addButtonId : `${surviving.id}-name`,
              );
            }}
          />
        </fieldset>
      ))}
      <button
        id={addButtonId}
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => {
          const item = props.create();
          props.onChange([...props.values, item]);
          focusAfterUpdate(`${item.id}-name`);
        }}
      >
        Add {props.title.toLowerCase()}
      </button>
    </section>
  );
}

function TextArrayEditor(props: {
  readonly label: string;
  readonly values: readonly TextValue[];
  readonly disabled: boolean;
  readonly onChange: (values: TextValue[]) => void;
}) {
  return (
    <fieldset className="nested-group">
      <legend>{pluralLabel(props.label)}</legend>
      {props.values.map((item, index) => (
        <div className="inline-edit" key={`${props.label}-${index}`}>
          <TextField
            id={`${props.label}-${index}`}
            label={`${capitalize(props.label)} ${index + 1}`}
            value={item.value}
            disabled={props.disabled}
            onChange={(value) =>
              props.onChange(replaceAt(props.values, index, manualText(value)))
            }
          />
          <RemoveButton
            label={`Remove ${props.label} ${index + 1}`}
            disabled={props.disabled}
            onClick={() => props.onChange(removeAt(props.values, index))}
          />
        </div>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, manualText("")])}
      >
        Add {props.label}
      </button>
    </fieldset>
  );
}

function TextField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly error?: string | undefined;
  readonly onChange: (value: string) => void;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        value={props.value}
        disabled={props.disabled}
        aria-invalid={props.error === undefined ? undefined : true}
        aria-describedby={props.error === undefined ? undefined : errorId}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
      {props.error === undefined ? null : (
        <p className="field-error" id={errorId}>
          {props.error}
        </p>
      )}
    </div>
  );
}

function TextArea(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly error?: string | undefined;
  readonly onChange: (value: string) => void;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <textarea
        id={props.id}
        rows={5}
        value={props.value}
        disabled={props.disabled}
        aria-invalid={props.error === undefined ? undefined : true}
        aria-describedby={props.error === undefined ? undefined : errorId}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
      {props.error === undefined ? null : (
        <p className="field-error" id={errorId}>
          {props.error}
        </p>
      )}
    </div>
  );
}

function RemoveButton(props: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      className="secondary-button danger-action"
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      Remove
    </button>
  );
}

function MoveButtons(props: {
  readonly label: string;
  readonly disabled: boolean;
  readonly index: number;
  readonly count: number;
  readonly onMove: (target: number) => void;
}) {
  return (
    <span className="move-actions">
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled || props.index === 0}
        onClick={() => props.onMove(props.index - 1)}
      >{`Move ${props.label} up`}</button>
      <button
        className="secondary-button"
        type="button"
        disabled={props.disabled || props.index >= props.count - 1}
        onClick={() => props.onMove(props.index + 1)}
      >{`Move ${props.label} down`}</button>
    </span>
  );
}

function manualText(value: string): TextValue {
  return {
    value,
    sourceStatus: "user_added",
    confidenceStatus: "not_applicable",
    inferenceStatus: "not_inferred",
  };
}

function optionalManualText(value: string): TextValue | undefined {
  return value.trim() === "" ? undefined : manualText(value);
}

function blankWorkExperience(): WorkExperience {
  return {
    id: newId(),
    employerName: "",
    roles: [blankRole()],
    reviewStatus: "edited",
    inferenceStatus: "not_inferred",
  };
}

function blankRole(): WorkRole {
  return {
    id: newId(),
    title: "",
    isOngoing: false,
    responsibilities: [],
    achievements: [],
    sourceStatus: "user_added",
    reviewStatus: "edited",
    inferenceStatus: "not_inferred",
  };
}

function blankEducation(): Education {
  return { id: newId(), institution: manualText(""), reviewStatus: "edited" };
}

function blankSkill(): Skill {
  return { id: newId(), name: manualText(""), reviewStatus: "edited" };
}

function blankLanguage(): Language {
  return { id: newId(), name: manualText(""), reviewStatus: "edited" };
}

function blankProject(): Project {
  return {
    id: newId(),
    name: manualText(""),
    links: [],
    reviewStatus: "edited",
  };
}

function blankCertification(): Certification {
  return { id: newId(), name: manualText(""), reviewStatus: "edited" };
}

function blankLink(): Link {
  return { id: newId(), url: manualText(""), reviewStatus: "edited" };
}

function parseYear(value: string) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100
    ? { year, precision: "year" as const }
    : undefined;
}

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function removeAt<T>(values: readonly T[], index: number): T[] {
  return values.filter((_, itemIndex) => itemIndex !== index);
}

function moveAt<T>(values: readonly T[], from: number, to: number): T[] {
  const next = [...values];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

function newId(): string {
  return createBrowserUuid();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function pluralLabel(value: string): string {
  if (value === "responsibility") return "Responsibilities";
  if (value === "achievement") return "Achievements";
  return `${capitalize(value)}s`;
}

function focusAfterUpdate(id: string): void {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}
