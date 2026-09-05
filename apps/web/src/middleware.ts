import { NextRequest, NextResponse } from "next/server";
import {
  applyCommonResponseHeaders,
  contentSecurityPolicy,
  cspHeaderName,
  isStaticAssetPath,
} from "./response-policy";

export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const policy = contentSecurityPolicy(nonce);
  const headerName = cspHeaderName();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(headerName, policy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(headerName, policy);
  applyCommonResponseHeaders(response.headers);

  if (
    !request.nextUrl.pathname.startsWith("/api/") &&
    !isStaticAssetPath(request.nextUrl.pathname)
  ) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}

export const config = {
  matcher: "/:path*",
};
