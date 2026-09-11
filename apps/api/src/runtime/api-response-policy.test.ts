import { afterEach, describe, expect, it, vi } from "vitest";
import { noStoreApiResponse, shouldExposeOpenApi } from "./api-response-policy";

afterEach(() => vi.unstubAllEnvs());

describe("API response policy", () => {
  it("marks API success and error paths no-store before routing", () => {
    const setHeader = vi.fn();
    const next = vi.fn();

    noStoreApiResponse({}, { setHeader }, next);

    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(["/resumes", "/openapi", "/openapi/", "/openapi-json", "/missing"])(
    "protects production %s without relying on the Next rewrite",
    (path) => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = new Headers();
      noStoreApiResponse(
        { path },
        { setHeader: (name, value) => headers.set(name, value) },
        () => {},
      );
      expect(headers.get("content-security-policy")).toBe(
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.get("referrer-policy")).toBe("no-referrer");
      expect(headers.get("x-frame-options")).toBe("DENY");
      expect(headers.get("permissions-policy")).toBe(
        "camera=(), geolocation=(), microphone=()",
      );
      expect(headers.get("strict-transport-security")).toBeNull();
    },
  );

  it.each([
    ["/openapi", false],
    ["/openapi/swagger-ui-init.js", false],
    ["/openapi-json", true],
    ["/openapi-other", true],
    ["/resumes", true],
  ])(
    "limits the development Swagger CSP exception to its UI: %s",
    (path, protectedResponse) => {
      vi.stubEnv("NODE_ENV", "development");
      const headers = new Headers();
      noStoreApiResponse(
        { path },
        { setHeader: (name, value) => headers.set(name, value) },
        () => {},
      );
      expect(headers.has("content-security-policy")).toBe(protectedResponse);
      expect(headers.get("cache-control")).toBe("no-store");
      expect(headers.get("x-content-type-options")).toBe("nosniff");
    },
  );

  it("exposes OpenAPI only outside production", () => {
    expect(shouldExposeOpenApi({ NODE_ENV: "production" })).toBe(false);
    expect(shouldExposeOpenApi({ NODE_ENV: "development" })).toBe(true);
    expect(shouldExposeOpenApi({ NODE_ENV: "test" })).toBe(true);
  });
});
