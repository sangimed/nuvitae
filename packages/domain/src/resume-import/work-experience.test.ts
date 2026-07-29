import { describe, expect, it } from "vitest";
import {
  formatOngoingRoleEndDate,
  groupExplicitWorkExperiences,
} from "./review.js";
import type { WorkExperience } from "./types.js";

describe("work experience review grouping", () => {
  it("preserves explicit employer groups, role ids, ordering, details, and ongoing display", () => {
    const grouped = groupExplicitWorkExperiences([
      experience("acme", ["r1", "r2"]),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.roles.map((role) => role.id)).toEqual(["r1", "r2"]);
    expect(
      grouped[0]?.roles[0]?.responsibilities.map((item) => item.value),
    ).toEqual(["Responsibility r1"]);
    expect(
      grouped[0]?.roles[1]?.achievements.map((item) => item.value),
    ).toEqual(["Achievement r2"]);
    expect(formatOngoingRoleEndDate(grouped[0]!.roles[1]!)).toBe("Present");
  });

  it("does not merge similar employer names or generic unstructured entries", () => {
    const grouped = groupExplicitWorkExperiences([
      experience("acme", ["r1"]),
      experience("acme-inc", ["r2"]),
      experience("generic", ["generic-entry"]),
    ]);
    expect(grouped.map((item) => item.id)).toEqual([
      "acme",
      "acme-inc",
      "generic",
    ]);
    expect(grouped[2]?.roles[0]?.title).toBe("Role generic-entry");
  });
});

function experience(id: string, roleIds: readonly string[]): WorkExperience {
  return {
    id,
    employerName: id,
    roles: roleIds.map((roleId, index) => ({
      id: roleId,
      title: `Role ${roleId}`,
      isOngoing: index === 1,
      responsibilities: [
        {
          value: `Responsibility ${roleId}`,
          sourceStatus: "explicit_source",
          confidenceStatus: "high",
          inferenceStatus: "not_inferred",
        },
      ],
      achievements: [
        {
          value: `Achievement ${roleId}`,
          sourceStatus: "explicit_source",
          confidenceStatus: "high",
          inferenceStatus: "not_inferred",
        },
      ],
      sourceStatus: "explicit_source",
      reviewStatus: "unreviewed",
      inferenceStatus: "not_inferred",
    })),
    reviewStatus: "unreviewed",
    inferenceStatus: "not_inferred",
  };
}
