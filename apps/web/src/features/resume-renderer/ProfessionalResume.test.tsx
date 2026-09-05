import { renderToStaticMarkup } from "react-dom/server";
import { ProfessionalResume } from "./ProfessionalResume";
import {
  createResumeRenderingModel,
  type CanonicalResumeForRendering,
} from "./model";

const value = (text: string) => ({ value: text });

function blankResume(): CanonicalResumeForRendering {
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

describe("professional resume renderer", () => {
  it("maps and renders all major sections in deterministic ATS reading order", () => {
    const model = createResumeRenderingModel({
      personal: [value("Zoë Martin"), value("Montréal, Canada")],
      contact: [value("zoe@example.test"), value("+1 555 0100")],
      headline: value("Platform Engineer"),
      summary: value("Builds reliable multilingual products."),
      workExperiences: [
        {
          id: "work-1",
          employerName: "Acme Labs",
          employerLocation: "Remote",
          roles: [
            {
              id: "role-1",
              title: "Senior Engineer",
              location: "Canada",
              startDate: { year: 2022, month: 3, precision: "month" },
              isOngoing: true,
              responsibilities: [value("Led platform delivery")],
              achievements: [value("Improved availability to 99.99%")],
            },
          ],
        },
      ],
      education: [
        {
          id: "education-1",
          institution: value("Université de Montréal"),
          credential: value("BSc"),
          fieldOfStudy: value("Computer Science"),
          endDate: { year: 2021, precision: "year" },
        },
      ],
      projects: [
        {
          id: "project-1",
          name: value("Nuvitae"),
          description: value("Accessible resume tooling"),
          links: [
            { label: "Project", url: value("https://example.test/project") },
          ],
        },
      ],
      skills: [{ id: "skill-1", name: value("TypeScript") }],
      certifications: [
        {
          id: "cert-1",
          name: value("Cloud Architect"),
          issuer: value("Example Cloud"),
          issuedAt: { year: 2023, precision: "year" },
        },
      ],
      languages: [
        {
          id: "language-1",
          name: value("Français"),
          proficiency: value("Native"),
        },
      ],
      professionalLinks: [
        { label: "Portfolio", url: value("https://zoe.example.test") },
      ],
    });

    expect(model.sections.map((section) => section.kind)).toEqual([
      "summary",
      "experience",
      "education",
      "projects",
      "skills",
      "certifications",
      "languages",
    ]);

    const markup = renderToStaticMarkup(<ProfessionalResume model={model} />);
    expect(markup).toContain('data-resume-template="professional"');
    expect(markup).toContain("<article");
    expect(markup).toContain("<header");
    expect(markup).toContain("<h1>Zoë Martin</h1>");
    expect(markup).toContain("Led platform delivery");
    expect(markup).toContain("Université de Montréal");
    expect(markup).toContain("Accessible resume tooling");
    expect(markup).toContain("Cloud Architect");
    expect(markup).toContain("Français");
    expect(markup).not.toContain("<img");

    const headings = [
      "Professional Summary",
      "Experience",
      "Education",
      "Projects",
      "Skills",
      "Certifications",
      "Languages",
    ];
    headings.reduce((previousIndex, heading) => {
      const index = markup.indexOf(heading);
      expect(index).toBeGreaterThan(previousIndex);
      return index;
    }, -1);
  });

  it("omits empty sections and preserves useful partial content", () => {
    const model = createResumeRenderingModel({
      ...blankResume(),
      contact: [value("person@example.test")],
      skills: [
        { id: "empty", name: value("  ") },
        { id: "skill", name: value("Accessibility") },
      ],
    });

    expect(model.identity.name).toBeUndefined();
    expect(model.sections.map((section) => section.kind)).toEqual(["skills"]);
    const markup = renderToStaticMarkup(<ProfessionalResume model={model} />);
    expect(markup).toContain("person@example.test");
    expect(markup).toContain("Accessibility");
    expect(markup).not.toContain("Experience");
    expect(markup).not.toContain("Unnamed");
  });

  it("uses the editor's persisted section order", () => {
    const model = createResumeRenderingModel({
      ...blankResume(),
      sectionOrder: [
        "basics",
        "skills",
        "summary",
        "workExperiences",
        "education",
        "projects",
        "certifications",
        "languages",
        "professionalLinks",
      ],
      summary: value("Summary content"),
      skills: [{ id: "skill", name: value("Accessibility") }],
    });

    expect(model.sections.map((section) => section.kind)).toEqual([
      "skills",
      "summary",
    ]);
  });

  it("renders a fully empty resume safely without invented resume data", () => {
    const markup = renderToStaticMarkup(
      <ProfessionalResume model={createResumeRenderingModel(blankResume())} />,
    );

    expect(markup).toContain("Resume content has not been added yet.");
    expect(markup).not.toContain("<section");
    expect(markup).not.toContain("Candidate");
  });

  it("does not make unsafe professional-link schemes executable", () => {
    const markup = renderToStaticMarkup(
      <ProfessionalResume
        model={createResumeRenderingModel({
          ...blankResume(),
          professionalLinks: [
            { label: "Portfolio", url: value("javascript:alert(1)") },
          ],
        })}
      />,
    );

    expect(markup).toContain("Portfolio");
    expect(markup).not.toContain("href=");
  });

  it("renders uploaded HTML-looking text as escaped inert content", () => {
    const markup = renderToStaticMarkup(
      <ProfessionalResume
        model={createResumeRenderingModel({
          ...blankResume(),
          summary: value('<script>alert("resume")</script>'),
        })}
      />,
    );

    expect(markup).toContain(
      "&lt;script&gt;alert(&quot;resume&quot;)&lt;/script&gt;",
    );
    expect(markup).not.toContain("<script>");
  });
});
