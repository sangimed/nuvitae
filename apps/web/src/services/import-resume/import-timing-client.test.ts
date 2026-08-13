import { describe, expect, it, vi } from "vitest";
import { recordImportTiming } from "./import-timing-client";

describe("recordImportTiming", () => {
  it("sends only the closed client timing payload", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));

    recordImportTiming({
      importId: "11111111-1111-4111-8111-111111111111",
      phase: "review_available_to_client",
      durationMs: 12.6,
      fetchImpl: fetcher,
    });
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        "/import-resume/11111111-1111-4111-8111-111111111111/timing",
      ),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          phase: "review_available_to_client",
          durationMs: 13,
        }),
      }),
    );
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toContain(
      "resume contents",
    );
  });
});
