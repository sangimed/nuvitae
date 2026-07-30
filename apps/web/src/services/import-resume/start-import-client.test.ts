import { describe, expect, it, vi } from "vitest";
import {
  parseRetryAfterSeconds,
  startImportUpload,
} from "./start-import-client";

const responseBody = {
  version: "2026-07-28",
  requestId: "11111111-1111-4111-8111-111111111111",
  importId: "22222222-2222-4222-8222-222222222222",
  status: "import_initialization",
  uploadStatus: "uploaded",
  retentionExpiresAt: "2026-08-05T09:30:00.000Z",
  manualEntryUrl: "/resumes/new/manual",
  userMessage: "Your resume was uploaded privately.",
};

describe("startImportUpload", () => {
  it("sends one multipart file field without manual Content-Type", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(init.headers).toBeUndefined();
      expect(init.body).toBeInstanceOf(FormData);
      expect([...(init.body as FormData).keys()]).toEqual(["file"]);
      return jsonResponse(201, responseBody);
    }) as unknown as typeof fetch;

    const outcome = await startImportUpload({
      file: new File(["safe"], "Candidate Resume.pdf", {
        type: "application/pdf",
      }),
      fetchImpl,
    });

    expect(outcome).toMatchObject({ ok: true });
    expect(JSON.stringify(outcome)).not.toContain("Candidate Resume.pdf");
    expect(JSON.stringify(outcome)).not.toContain("safe");
  });

  it.each([
    [401, "authentication_required"],
    [400, "invalid_upload"],
    [413, "oversized_file"],
    [415, "unsupported_format"],
    [429, "rate_limited"],
    [503, "temporarily_unavailable"],
    [500, "unexpected_failure"],
  ] as const)("maps HTTP %s to %s", async (status, category) => {
    const outcome = await startImportUpload({
      file: new File(["safe"], "resume.pdf"),
      fetchImpl: vi.fn(async () =>
        jsonResponse(status, { private: "body" }),
      ) as unknown as typeof fetch,
    });
    expect(outcome).toMatchObject({ ok: false, category });
    expect(JSON.stringify(outcome)).not.toContain("private");
  });

  it("honours Retry-After without resubmitting", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(429, {}, { "Retry-After": "47" }),
    ) as unknown as typeof fetch;
    const outcome = await startImportUpload({
      file: new File(["safe"], "resume.pdf"),
      fetchImpl,
    });
    expect(outcome).toMatchObject({ ok: false, retryAfterSeconds: 47 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("preserves public error category messages without exposing response bodies", async () => {
    const outcome = await startImportUpload({
      file: new File(["safe"], "resume.txt", { type: "text/plain" }),
      fetchImpl: vi.fn(async () =>
        jsonResponse(415, {
          code: "unsupported_format",
          message: "private parser detail",
        }),
      ) as unknown as typeof fetch,
    });

    expect(outcome).toEqual({
      ok: false,
      category: "unsupported_format",
      message: "Choose a PDF or DOCX resume file.",
    });
    expect(JSON.stringify(outcome)).not.toContain("private parser detail");
  });
});

describe("parseRetryAfterSeconds", () => {
  it("parses seconds and HTTP dates", () => {
    expect(parseRetryAfterSeconds("12")).toBe(12);
    expect(parseRetryAfterSeconds("bad")).toBeUndefined();
  });
});

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
