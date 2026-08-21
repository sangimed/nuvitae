const publicApiBaseUrl = process.env.NEXT_PUBLIC_NUVITAE_API_BASE_URL;

export function getApiBaseUrl(): string {
  if (publicApiBaseUrl === undefined || publicApiBaseUrl.trim() === "") {
    return "/api";
  }
  try {
    const url = new URL(publicApiBaseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("Invalid NEXT_PUBLIC_NUVITAE_API_BASE_URL.");
  }
}

export function apiPath(path: string): string {
  return `${getApiBaseUrl()}${path}`;
}
