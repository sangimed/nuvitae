import { describe, expect, it } from "vitest";

import { semanticParserInstructions } from "./semantic-parser-instructions.js";

describe("Semantic V2 parser instructions", () => {
  it("states the exact contact allowlist and routing rules", () => {
    expect(semanticParserInstructions).toContain(
      "The sections.contact object is required and has exactly these allowed keys and no others: fullName, email, phone, location, website.",
    );
    expect(semanticParserInstructions).toContain(
      "Every key is required in the canonical shape and accepts either one grounded atom or null",
    );
    expect(semanticParserInstructions).toContain(
      "For every non-null contact value, include at least one sourceRefs entry",
    );
    expect(semanticParserInstructions).toContain(
      "Never invent a contact value, phone country code, location, URL, website title, or identity",
    );
    expect(semanticParserInstructions).toContain(
      "Put a professional title or headline in sections.headline",
    );
    expect(semanticParserInstructions).toContain(
      "put professional, social, or profile links and their URLs in sections.professionalLinks",
    );
    expect(semanticParserInstructions).toContain(
      "A concept with no accepted destination must be omitted.",
    );
  });

  it("preserves compact omission semantics while forbidding extra contact keys", () => {
    expect(semanticParserInstructions).toContain(
      "in compact output, omit only an absent nullable key and Nuvitae restores it to null",
    );
    expect(semanticParserInstructions).toContain(
      "Contact values must not be copied into another section.",
    );
  });

  it("prioritizes Education completeness before generic omission guidance", () => {
    const educationPriority = semanticParserInstructions.indexOf(
      "EDUCATION COMPLETENESS PRIORITY",
    );
    const genericOmission = semanticParserInstructions.indexOf(
      "For generic compact output, omit empty collection properties",
    );

    expect(educationPriority).toBeGreaterThanOrEqual(0);
    expect(genericOmission).toBeGreaterThan(educationPriority);
    expect(semanticParserInstructions).toContain(
      "scan the complete ordered source fragment list for section headings",
    );
    expect(semanticParserInstructions).toContain(
      "If an Education section contains following content",
    );
    expect(semanticParserInstructions).toContain(
      "Never omit Education or emit an empty education collection when Education is expected",
    );
  });
});
