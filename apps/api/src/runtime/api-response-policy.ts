interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

export function noStoreApiResponse(
  _request: unknown,
  response: HeaderResponse,
  next: () => void,
): void {
  response.setHeader("Cache-Control", "no-store");
  next();
}

export function shouldExposeOpenApi(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== "production";
}
