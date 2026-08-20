import { describe, expect, it } from "vitest";

import { semanticParserInstructions } from "./semantic-parser-instructions.js";

describe("Semantic V2 parser instructions", () => {
  it("prioritizes complete, grounded Education before compact omission guidance", () => {
    const educationBlock = semanticParserInstructions.indexOf(
      "EDUCATION COMPLETENESS PRIORITY",
    );
    const genericOmissionGuidance = semanticParserInstructions.indexOf(
      "GENERIC COMPACT OMISSION",
    );

    expect(educationBlock).toBeGreaterThanOrEqual(0);
    expect(genericOmissionGuidance).toBeGreaterThan(educationBlock);
    expect(semanticParserInstructions).toContain(
      "Before applying generic compact omission guidance, scan the complete ordered source fragment list for section headings",
    );
    expect(semanticParserInstructions).toContain(
      "An institution-bearing entry must still be emitted when degree, fieldOfStudy, dates, or location are unavailable",
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
      "For every non-null contact value, include one direct sourceRef, or an ordered source-proven continuation sequence",
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

  it("makes grounded split-scalar ownership and reconstruction unambiguous", () => {
    expect(semanticParserInstructions).toContain(
      "Use exactly one sourceRef whenever one fragment directly contains the complete scalar",
    );
    expect(semanticParserInstructions).toContain(
      "A scalar may use ordered multiple sourceRefs only when the complete value genuinely crosses consecutive fragments",
    );
    expect(semanticParserInstructions).toContain(
      "Do not attach sourceRefs to a workExperience, role, or education group object",
    );
    expect(semanticParserInstructions).toContain(
      'continuationToNext "none" inserts no character and "space" inserts one ordinary space',
    );
    expect(semanticParserInstructions).toContain(
      "These scalar rules apply uniformly to contact, headline, employerName, role fields, education fields, skills, languages, project names, certifications, and links",
    );
  });

  it("forbids grounded semantic truncation without adding fuzzy validation", () => {
    expect(semanticParserInstructions).toContain(
      "Never shorten, simplify, abbreviate, or return only a prefix or token of that concept merely because the shorter text is easier to ground",
    );
    expect(semanticParserInstructions).toContain(
      "If the complete semantic concept cannot be represented by the allowed sourceRefs, omit the atom",
    );
    expect(semanticParserInstructions).toContain(
      "Nuvitae verifies exact grounding and provenance; you remain responsible for identifying the complete semantic concept",
    );
  });

  it("separates long-form grounding from semantic completeness", () => {
    expect(semanticParserInstructions).toContain(
      "A complete concept may occupy all or only part of an extraction fragment",
    );
    expect(semanticParserInstructions).toContain(
      "A value may cross consecutive fragments only when every crossed boundary is source-proven by continuationToNext",
    );
    expect(semanticParserInstructions).toContain(
      "does not treat fragment shape or your completeness assertion as deterministic proof of the semantic boundary",
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
