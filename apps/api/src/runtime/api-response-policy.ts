interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

export function noStoreApiResponse(
  request: { readonly path?: string },
  response: HeaderResponse,
  next: () => void,
): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=()",
  );
  // JSON API responses never need executable content. Only the development
  // Swagger UI is an HTML application; it is not mounted in production.
  const developmentSwagger =
    shouldExposeOpenApi() &&
    (request.path === "/openapi" || request.path?.startsWith("/openapi/"));
  if (!developmentSwagger) {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  }
  next();
}

export function shouldExposeOpenApi(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== "production";
}
