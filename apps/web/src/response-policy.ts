const commonResponseHeaders = {
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export function contentSecurityPolicy(
  nonce: string,
  publicApiBaseUrl: string | undefined = process.env
    .NEXT_PUBLIC_NUVITAE_API_BASE_URL,
): string {
  const connectSources = ["'self'", publicApiOrigin(publicApiBaseUrl)]
    .filter((source): source is string => source !== undefined)
    .join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources}`,
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "worker-src 'none'",
  ].join("; ");
}

export function applyCommonResponseHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(commonResponseHeaders)) {
    headers.set(name, value);
  }
}

export function cspHeaderName(
  reportOnly = process.env.NUVITAE_CSP_REPORT_ONLY !== "false",
): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}

export function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image/") ||
    pathname === "/favicon.ico"
  );
}

function publicApiOrigin(configured: string | undefined): string | undefined {
  if (configured === undefined || configured.trim() === "") return undefined;
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Invalid NEXT_PUBLIC_NUVITAE_API_BASE_URL.");
  }
  return url.origin;
}
