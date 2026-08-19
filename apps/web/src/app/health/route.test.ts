import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("web health route", () => {
  it("keeps runtime liveness available outside the product UI", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "web", status: "ok" });
  });
});
