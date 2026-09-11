import { NextRequest, NextResponse } from "next/server";
import {
  applyCommonResponseHeaders,
  contentSecurityPolicy,
  cspHeaderName,
  isStaticAssetPath,
} from "./response-policy";

export function middleware(request: NextRequest) {
  // The external rewrite streams Nest's response. Nest owns API headers;
  // adding a second CSP here would depend on Next's proxy implementation.
  if (
    request.nextUrl.pathname === "/api" ||
    request.nextUrl.pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }
  const nonce = crypto.randomUUID();
  const policy = contentSecurityPolicy(nonce);
  const headerName = cspHeaderName();
  const requestHeaders = new Headers(request.headers);
  // Next reads request CSP headers to select the rendering nonce. Neither
  // policy mode may inherit a competing, client-supplied nonce or policy.
  requestHeaders.delete("Content-Security-Policy");
  requestHeaders.delete("Content-Security-Policy-Report-Only");
  requestHeaders.set(headerName, policy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(headerName, policy);
  applyCommonResponseHeaders(response.headers);

  if (!isStaticAssetPath(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}

export const config = {
  matcher: "/:path*",
};
