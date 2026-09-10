import { describe, expect, it } from "vitest";
import {
  applyCommonResponseHeaders,
  contentSecurityPolicy,
  cspHeaderName,
  isStaticAssetPath,
} from "./response-policy";

describe("web response policy", () => {
  it("allows only the application resources required by the current runtime", () => {
    const policy = contentSecurityPolicy(
      "test-nonce",
      "https://api.example.test/v1",
    );

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self' https://api.example.test");
    expect(policy).toContain(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic'",
    );
    expect(policy).toContain("style-src 'self' 'nonce-test-nonce'");
    expect(policy).toContain("font-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("*");
  });

  it("does not add another connection origin for same-origin API routing", () => {
    expect(contentSecurityPolicy("test-nonce", undefined)).toContain(
      "connect-src 'self';",
    );
  });

  it("rejects a non-HTTP public API source", () => {
    expect(() =>
      contentSecurityPolicy("test-nonce", "javascript:alert(1)"),
    ).toThrow("Invalid NEXT_PUBLIC_NUVITAE_API_BASE_URL.");
  });

  it("switches explicitly between report-only trial and enforcement", () => {
    expect(cspHeaderName(true)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(false)).toBe("Content-Security-Policy");
  });

  it("sets common browser protections without claiming HSTS", () => {
    const headers = new Headers();
    applyCommonResponseHeaders(headers);

    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("permissions-policy")).toBe(
      "camera=(), geolocation=(), microphone=()",
    );
    expect(headers.get("strict-transport-security")).toBeNull();
  });

  it("keeps framework static assets outside the page no-store policy", () => {
    expect(isStaticAssetPath("/_next/static/css/app.css")).toBe(true);
    expect(isStaticAssetPath("/_next/image/example")).toBe(true);
    expect(isStaticAssetPath("/resumes/abc")).toBe(false);
  });
});
