const publicApiBaseUrl = process.env.NEXT_PUBLIC_NUVITAE_API_BASE_URL;

export function getImportResumeApiBaseUrl(): string {
  if (publicApiBaseUrl === undefined || publicApiBaseUrl.trim() === "") {
    return "";
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

export function importResumeApiPath(path: string): string {
  return `${getImportResumeApiBaseUrl()}${path}`;
}
