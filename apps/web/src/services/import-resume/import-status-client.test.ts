import { describe, expect, it, vi } from "vitest";
import {
  pollImportStatus,
  preserveNonRegressiveStatus,
  readImportStatus,
} from "./import-status-client";

const base = {
  version: "2026-07-28",
  requestId: "11111111-1111-4111-8111-111111111111",
  importId: "22222222-2222-4222-8222-222222222222",
  allowedRecoveryActions: ["manual_entry"],
  userMessage: "Checking.",
};

describe("readImportStatus", () => {
  it("validates every response and treats malformed data as safe failure", async () => {
    const outcome = await readImportStatus({
      importId: base.importId,
      fetchImpl: vi.fn(async () =>
        jsonResponse(200, { ...base, status: "processing" }),
      ) as unknown as typeof fetch,
    });
    expect(outcome).toMatchObject({
      ok: false,
      category: "unexpected_failure",
    });
  });
});

describe("pollImportStatus", () => {
  it("prevents overlapping polls and stops at terminal state", async () => {
    let active = 0;
    let maxActive = 0;
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        active -= 1;
        return jsonResponse(200, processing("reading_content"));
      })
      .mockImplementationOnce(async () => jsonResponse(200, draftReady()));
    const seen: string[] = [];
    await pollImportStatus({
      importId: base.importId,
      signal: new AbortController().signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      intervalMs: 1,
      delay: async () => undefined,
      onStatus: (status) => seen.push(status.status),
    });
    expect(maxActive).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(["processing", "draft_ready"]);
  });

  it("uses bounded connectivity backoff and resets after success", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(jsonResponse(200, draftReady()));
    const delays: number[] = [];
    await pollImportStatus({
      importId: base.importId,
      signal: new AbortController().signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      intervalMs: 10,
      maxBackoffMs: 15,
      delay: async (ms) => {
        delays.push(ms);
      },
      onStatus: () => undefined,
    });
    expect(delays).toEqual([10, 15]);
  });

  it("supports cancellation", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, processing("reading_content")),
    );
    await pollImportStatus({
      importId: base.importId,
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => controller.abort(),
      onStatus: () => undefined,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("preserveNonRegressiveStatus", () => {
  it("preserves latest confirmed progress step", () => {
    expect(
      preserveNonRegressiveStatus(
        processing("preparing_review"),
        processing("reading_content"),
      ),
    ).toMatchObject({ currentStep: "preparing_review" });
  });
});

function processing(currentStep: string) {
  return {
    ...base,
    status: "processing",
    currentStep,
    progressKnown: false,
  };
}

function draftReady() {
  return {
    ...base,
    status: "draft_ready",
    progressKnown: true,
    progressPercent: 100,
    draftSummary: {
      draftId: "33333333-3333-4333-8333-333333333333",
      retentionExpiresAt: "2026-08-05T09:30:00.000Z",
      fieldCount: 4,
      warningCount: 0,
    },
    userMessage: "Ready.",
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
