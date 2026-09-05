import { describe, expect, it, vi } from "vitest";
import {
  noStoreApiResponse,
  shouldExposeOpenApi,
} from "./api-response-policy";

describe("API response policy", () => {
  it("marks API success and error paths no-store before routing", () => {
    const setHeader = vi.fn();
    const next = vi.fn();

    noStoreApiResponse({}, { setHeader }, next);

    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalledOnce();
  });

  it("exposes OpenAPI only outside production", () => {
    expect(shouldExposeOpenApi({ NODE_ENV: "production" })).toBe(false);
    expect(shouldExposeOpenApi({ NODE_ENV: "development" })).toBe(true);
    expect(shouldExposeOpenApi({ NODE_ENV: "test" })).toBe(true);
  });
});
