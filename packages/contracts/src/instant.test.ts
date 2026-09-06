import { describe, expect, it } from "vitest";
import {
  offsetAwareInstantSchema,
  parseOffsetAwareInstant,
  utcInstantSchema,
} from "./instant.js";

describe("instant contracts", () => {
  it("requires an explicit timezone and makes UTC serialization canonical", () => {
    expect(utcInstantSchema.safeParse("2026-10-25T00:30:00.000Z").success).toBe(
      true,
    );
    expect(
      utcInstantSchema.safeParse("2026-10-25T02:30:00.000+02:00").success,
    ).toBe(false);
    expect(utcInstantSchema.safeParse("2026-10-25T02:30:00.000").success).toBe(
      false,
    );
  });

  it("preserves an offset-aware provider instant across a DST boundary", () => {
    const instant = parseOffsetAwareInstant("2026-10-25T02:30:00.000+02:00");
    expect(instant?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(
      offsetAwareInstantSchema.safeParse("2026-10-25T02:30:00.000").success,
    ).toBe(false);
  });
});
