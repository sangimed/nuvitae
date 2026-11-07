import { describe, expect, it } from "vitest";
import { maskSensitiveOutput, scanTextForHostileContent } from "./safety.js";

describe("bounded safety text processing", () => {
  it.each([
    ["@a@b.c", "@[redacted-email]"],
    ["a@b.c@d.e", "[redacted-email]@d.e"],
    ["a@b.c+d@e.f", "[redacted-email][redacted-email]"],
    ["a@b..", "[redacted-email]"],
    ["a@.b.", "a@.b."],
  ])("preserves masking boundaries for %s", (input, expected) => {
    expect(maskSensitiveOutput(input)).toBe(expected);
  });
  it("masks synthetic emails and preserves surrounding text", () => {
    expect(
      maskSensitiveOutput("A <a+b@example.invalid> a@b.c@d.e no@domain"),
    ).toBe("A <[redacted-email]> [redacted-email]@d.e no@domain");
  });

  it("keeps synthetic nonmatching email text within a generous resource ceiling", () => {
    const text = ".".repeat(60_000) + "!";
    const started = performance.now();
    expect(maskSensitiveOutput(text)).toBe(text);
    expect(performance.now() - started).toBeLessThan(1_000);
  }, 10_000);

  it("preserves attachment, relationship and traversal classifications", () => {
    expect(scanTextForHostileContent("attachment='a.pdf'")).toContain(
      "file_attachment",
    );
    expect(scanTextForHostileContent("attachment='a\n.pdf'")).not.toContain(
      "file_attachment",
    );
    expect(scanTextForHostileContent("attachment\n =\n 'a.pdf'")).toContain(
      "file_attachment",
    );
    expect(scanTextForHostileContent("attachment='.pdf'")).not.toContain(
      "file_attachment",
    );
    expect(
      scanTextForHostileContent('<Relationship TargetMode="External">'),
    ).toContain("external_relationship");
    expect(
      scanTextForHostileContent("<relationship targetmode='external"),
    ).toContain("external_relationship");
    expect(
      scanTextForHostileContent("<relationship> targetmode='external"),
    ).not.toContain("external_relationship");
    expect(scanTextForHostileContent("/a/../file")).toContain("path_traversal");
    expect(scanTextForHostileContent("../file")).not.toContain(
      "path_traversal",
    );
    expect(scanTextForHostileContent("..\\file")).toContain("path_traversal");
  });

  it("handles bounded repeated attachment and path prefixes", () => {
    const started = performance.now();
    expect(
      scanTextForHostileContent("attachment='".repeat(4_000)),
    ).not.toContain("file_attachment");
    expect(scanTextForHostileContent("/a".repeat(30_000))).not.toContain(
      "path_traversal",
    );
    expect(performance.now() - started).toBeLessThan(1_000);
  }, 10_000);
});
