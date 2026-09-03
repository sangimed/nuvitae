import { describe, expect, it, vi } from "vitest";
import { recordCommunityFunnelEvent } from "./community-funnel";

describe("recordCommunityFunnelEvent", () => {
  it("sends only a closed product event payload", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));

    recordCommunityFunnelEvent(
      {
        funnelEvent: "pdf_export.failed",
        failureCategory: "preparation_timeout",
      },
      fetcher,
    );
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/community-funnel/events"),
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({
          funnelEvent: "pdf_export.failed",
          failureCategory: "preparation_timeout",
        }),
      }),
    );
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toMatch(
      /resume|owner|token|filename/i,
    );
  });
});
