import { describe, expect, it } from "vitest";
import { bootstrapHealthSchema } from "./index";

describe("bootstrapHealthSchema", () => {
  it("rejects unknown service names", () => {
    expect(() =>
      bootstrapHealthSchema.parse({
        service: "database",
        status: "ok",
      }),
    ).toThrow();
  });
});
