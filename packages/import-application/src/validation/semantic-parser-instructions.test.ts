import { describe, expect, it } from "vitest";

import { semanticParserInstructions } from "./semantic-parser-instructions.js";

describe("Semantic V2 parser instructions", () => {
  it("states the exact contact allowlist and routing rules", () => {
    expect(semanticParserInstructions).toContain(
      "The sections.contact object has exactly these allowed keys and no others: fullName, email, phone, location, website.",
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
      "omitted contact scalar fields are restored to null",
    );
    expect(semanticParserInstructions).toContain(
      "only the five allowlisted keys may be present",
    );
  });
});
