import { describe, expect, it } from "vitest";
import { formatReviewDate, formatReviewDateRange } from "./review-date";

describe("review partial-date display", () => {
  it("preserves year-only precision", () => {
    expect(formatReviewDate({ year: 2020, precision: "year" })).toBe("2020");
  });

  it("preserves month/year precision without timezone conversion", () => {
    expect(
      formatReviewDate({
        year: 2020,
        month: 2,
        precision: "month",
        originalText: "02/2020",
      }),
    ).toBe("02/2020");
  });

  it("renders present/current explicitly", () => {
    expect(
      formatReviewDate({ precision: "present", originalText: "Current" }),
    ).toBe("Current");
    expect(formatReviewDate({ precision: "present" })).toBe("Present");
  });

  it("renders a start and present end as a date range", () => {
    expect(
      formatReviewDateRange({
        kind: "date_range",
        startDate: { year: 2020, month: 2, precision: "month" },
        endDate: { precision: "present", originalText: "Present" },
        isOngoing: true,
      }),
    ).toBe("02/2020 – Present");
  });
});
