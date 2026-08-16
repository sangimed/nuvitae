import { describe, expect, it } from "vitest";

import { semanticParserInstructions } from "./semantic-parser-instructions.js";

describe("Semantic V2 parser instructions", () => {
  it("prioritizes complete, grounded Education before compact omission guidance", () => {
    const educationBlock = semanticParserInstructions.indexOf(
      "EDUCATION COMPLETENESS (HIGH PRIORITY)",
    );
    const genericOmissionGuidance = semanticParserInstructions.indexOf(
      "GENERIC COMPACT OMISSION",
    );

    expect(educationBlock).toBeGreaterThanOrEqual(0);
    expect(genericOmissionGuidance).toBeGreaterThan(educationBlock);
    expect(semanticParserInstructions).toContain(
      "First scan the complete ordered fragment list for section headings.",
    );
    expect(semanticParserInstructions).toContain(
      "If a real Education section contains entries before the next recognized section heading, Education is expected.",
    );
    expect(semanticParserInstructions).toContain(
      "Emit every usable grounded Education entry from that section.",
    );
    expect(semanticParserInstructions).toContain(
      "An institution-bearing entry must still be emitted when degree, fieldOfStudy, dates, or location are unavailable.",
    );
    expect(semanticParserInstructions).toContain(
      "Never omit sections.education or emit an empty Education collection when an Education section is expected.",
    );
    expect(semanticParserInstructions).toContain(
      "Never invent missing education values.",
    );
    expect(semanticParserInstructions).toContain(
      "Every emitted Education atom must remain grounded with exact sourceRefs.",
    );
    expect(semanticParserInstructions).toContain(
      "Generic compact omission guidance never overrides this Education completeness rule.",
    );
  });

  it("keeps generic collection omission source-aware without making Summary universal", () => {
    expect(semanticParserInstructions).toContain(
      "Omit a collection only when the source contains no evidence for that section.",
    );
    expect(semanticParserInstructions).not.toContain("Summary is required");
    expect(semanticParserInstructions).not.toContain("Always emit Summary");
  });

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
});
