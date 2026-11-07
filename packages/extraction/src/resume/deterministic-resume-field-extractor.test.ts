import { describe, expect, it } from "vitest";
import { DeterministicResumeFieldExtractor } from "./deterministic-resume-field-extractor.js";
import type { ResumeSourceFragment } from "./source-fragments.js";

const location = {
  kind: "pdf_text_item" as const,
  pageNumber: 1,
  itemIndex: 0,
  readingOrder: 0,
  boundingBox: { x: 1, y: 2, width: 3, height: 4, unit: "pdf_point" as const },
};
const fragments = (texts: readonly string[]): ResumeSourceFragment[] =>
  texts.map((text, order) => ({
    text,
    order,
    format: "pdf",
    location: { ...location, itemIndex: order, readingOrder: order },
  }));

describe("DeterministicResumeFieldExtractor", () => {
  it.each([
    ["a@b..", true],
    ["a@..b", true],
    ["a@.b.", false],
    ["a@b.", false],
    ["a@.b", false],
    ["a@b.c@d.e", false],
    ["a@b.c d", false],
  ])("preserves historical email acceptance for %s", (value, accepted) => {
    const result = new DeterministicResumeFieldExtractor().extract(
      fragments([`Email: ${value}`]),
      "english",
      "pdf",
    );
    expect(result.fields.length > 0).toBe(accepted);
  });
  it("rejects bounded synthetic malformed email text without repeated suffix searches", () => {
    const started = performance.now();
    const result = new DeterministicResumeFieldExtractor().extract(
      fragments(["a@" + ".".repeat(60_000) + "@"]),
      "english",
      "pdf",
    );
    expect(result.fields).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1_000);
  }, 10_000);

  it("keeps permissive historical email recognition and URL punctuation behavior", () => {
    const result = new DeterministicResumeFieldExtractor().extract(
      fragments(["Email: a@b..", "a@b.c", "https://example.invalid/path.,;"]),
      "english",
      "pdf",
    );
    expect(result.fields.map((field) => field.value)).toEqual([
      { kind: "text", value: "a@b.." },
      { kind: "text", value: "a@b.c" },
      { kind: "link", url: "https://example.invalid/path" },
    ]);
  });

  it("extracts explicit contact, links, and headed sections with provenance", () => {
    const result = new DeterministicResumeFieldExtractor().extract(
      fragments([
        "Name: Synthetic Candidate",
        "Email: candidate@example.invalid",
        "+33 1 00 00 00 00",
        "https://example.invalid/profile",
        "Skills",
        "TypeScript, PostgreSQL",
        "Experience",
        "Engineer at Example Organisation",
      ]),
      "english",
      "pdf",
    );
    expect(result.fields.map((field) => field.fieldPath)).toEqual([
      "personal.name",
      "contact.email",
      "contact.phone",
      "professional_links.url",
      "skills.name",
      "skills.name",
      "work_experience.entry",
    ]);
    expect(
      result.fields.every((field) => field.sourceLocation !== undefined),
    ).toBe(true);
    expect(result.fields[0]?.sourceLocation).toMatchObject({
      kind: "pdf_text_item",
      pageNumber: 1,
      itemIndex: 0,
    });
  });

  it("does not infer skills from prose outside a skills heading", () => {
    const result = new DeterministicResumeFieldExtractor().extract(
      fragments([
        "Worked with TypeScript and PostgreSQL at Example Organisation",
      ]),
      "english",
      "pdf",
    );
    expect(result.fields.some((field) => field.section === "skills")).toBe(
      false,
    );
    expect(result.category).toBe("no_supported_field");
  });

  it("is deterministic and keeps optional sections optional", () => {
    const input = fragments(["Email: candidate@example.invalid"]);
    const extractor = new DeterministicResumeFieldExtractor();
    expect(extractor.extract(input, "english", "pdf")).toEqual(
      extractor.extract(input, "english", "pdf"),
    );
    expect(extractor.extract(input, "english", "pdf").category).toBe("partial");
  });
});
