import { describe, expect, it } from "vitest";
import { validateFactPreservingEdit } from "./fact-preservation.js";

describe("validateFactPreservingEdit", () => {
  it("allows concise grammatical rewrites grounded in source words", () => {
    expect(
      validateFactPreservingEdit(
        "Was responsible for managing the platform and improving reliability.",
        "Managed the platform and improved reliability.",
      ),
    ).toEqual({
      ok: true,
      proposedText: "Managed the platform and improved reliability.",
    });
  });

  it.each([
    ["name", "Partnered with Alice Smith.", "Partnered with Bob Smith."],
    ["employer", "Built Acme systems.", "Built Globex systems."],
    ["date", "Led delivery in March 2024.", "Led delivery in April 2025."],
    ["metric", "Reduced latency by 20%.", "Reduced latency by 40%."],
    [
      "unsupported claim",
      "Built payment systems.",
      "Built award winning payment systems.",
    ],
  ])("rejects an invented or changed %s", (_label, before, after) => {
    expect(validateFactPreservingEdit(before, after).ok).toBe(false);
  });

  it("rejects removal of protected facts", () => {
    expect(
      validateFactPreservingEdit(
        "Delivered Acme migration in 2024.",
        "Delivered migration.",
      ),
    ).toEqual({ ok: false, reason: "protected_fact_changed" });
  });

  it("rejects removing or adding negation", () => {
    expect(
      validateFactPreservingEdit("Did not manage payroll.", "Managed payroll."),
    ).toEqual({ ok: false, reason: "meaning_reversed" });
  });
});
