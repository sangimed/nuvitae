import { describe, expect, it } from "vitest";
import { bootstrapHealthSchema } from "@nuvitae/contracts";

describe("web bootstrap contract", () => {
  it("accepts the web liveness payload", () => {
    expect(
      bootstrapHealthSchema.parse({
        service: "web",
        status: "ok",
      }),
    ).toEqual({
      service: "web",
      status: "ok",
    });
  });
});
