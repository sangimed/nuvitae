import { describe, expect, it, vi } from "vitest";
import { createManualDraft, readManualDraft } from "./manual-draft-client";

describe("manual draft client", () => {
  it("classifies a missing draft separately from temporary failures", async () => {
    const outcome = await readManualDraft({
      draftId: "00000000-0000-4000-8000-000000009999",
      fetchImpl: vi.fn(async () => new Response("", { status: 404 })) as
        typeof fetch | undefined,
    });

    expect(outcome).toEqual({
      ok: false,
      category: "not_found",
      message: "Draft not found.",
    });
  });

  it("keeps temporary failures retryable without converting them to not found", async () => {
    const outcome = await readManualDraft({
      draftId: "00000000-0000-4000-8000-000000009998",
      fetchImpl: vi.fn(async () => new Response("", { status: 503 })) as
        typeof fetch | undefined,
    });

    expect(outcome).toMatchObject({
      ok: false,
      category: "temporarily_unavailable",
    });
  });

  it("creates a replacement draft with a caller-provided creation key", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        creationKey: "manual-00000000-0000-4000-8000-000000000111",
      });
      return new Response(
        JSON.stringify({
          version: "2026-07-28",
          requestId: "00000000-0000-4000-8000-000000000112",
          status: "manual_draft",
          draft: {
            draftId: "00000000-0000-4000-8000-000000000113",
            source: "manual_entry",
            status: "editing",
            content: emptyContent(),
            createdAt: "2026-07-30T00:00:00.000Z",
            updatedAt: "2026-07-30T00:00:00.000Z",
          },
          userMessage: "Manual resume draft ready.",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const outcome = await createManualDraft({
      creationKey: "manual-00000000-0000-4000-8000-000000000111",
      fetchImpl,
    });

    expect(outcome).toMatchObject({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

function emptyContent() {
  return {
    personal: [],
    contact: [],
    workExperiences: [],
    education: [],
    skills: [],
    languages: [],
    projects: [],
    certifications: [],
    professionalLinks: [],
  };
}
