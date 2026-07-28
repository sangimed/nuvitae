import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns the API liveness payload", () => {
    expect(new HealthController().getHealth()).toEqual({
      service: "api",
      status: "ok",
    });
  });
});
