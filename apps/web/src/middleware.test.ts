import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

afterEach(() => vi.unstubAllEnvs());

describe("response policy request boundary", () => {
  it.each(["/api", "/api/resumes"])("leaves %s headers to Nest", (path) => {
    const response = middleware(
      new NextRequest(`https://web.example.test${path}`),
    );
    expect(response.headers.has("content-security-policy")).toBe(false);
    expect(response.headers.has("content-security-policy-report-only")).toBe(
      false,
    );
    expect(response.headers.has("cache-control")).toBe(false);
    expect(response.headers.has("x-content-type-options")).toBe(false);
  });

  it.each(["true", "false"])(
    "replaces client policy and nonce headers in report-only=%s",
    (reportOnly) => {
      vi.stubEnv("NUVITAE_CSP_REPORT_ONLY", reportOnly);
      const request = new NextRequest("https://web.example.test/resumes", {
        headers: {
          "content-security-policy": "script-src 'nonce-client-chosen'",
          "content-security-policy-report-only":
            "script-src 'nonce-client-chosen'",
          "x-nonce": "client-chosen",
        },
      });
      const response = middleware(request);
      const selected =
        reportOnly === "true"
          ? "content-security-policy-report-only"
          : "content-security-policy";
      const other =
        reportOnly === "true"
          ? "content-security-policy"
          : "content-security-policy-report-only";

      expect(response.headers.get(`x-middleware-request-${selected}`)).toBe(
        response.headers.get(selected),
      );
      expect(response.headers.get(`x-middleware-request-${other}`)).toBeNull();
      expect(response.headers.get("x-middleware-request-x-nonce")).not.toBe(
        "client-chosen",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
});
