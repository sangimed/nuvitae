// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityFunnelBeacon } from "./CommunityFunnelBeacon";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const recordCommunityFunnelEvent = vi.hoisted(() => vi.fn());

vi.mock("../services/community-funnel", () => ({
  recordCommunityFunnelEvent,
}));

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  recordCommunityFunnelEvent.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = undefined;
  vi.unstubAllGlobals();
});

describe("CommunityFunnelBeacon", () => {
  it("records first run only after the owner boundary is authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    root = createRoot(container);

    await act(async () => {
      root?.render(<CommunityFunnelBeacon />);
    });

    expect(recordCommunityFunnelEvent).toHaveBeenCalledOnce();
    expect(recordCommunityFunnelEvent).toHaveBeenCalledWith({
      funnelEvent: "first_run.reached",
    });
  });

  it("records a successful sign-in event once without storing identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    root = createRoot(container);
    await act(async () => {
      root?.render(<CommunityFunnelBeacon />);
    });

    act(() => {
      window.dispatchEvent(new Event("nuvitae:community-authenticated"));
      window.dispatchEvent(new Event("nuvitae:community-authenticated"));
    });

    expect(recordCommunityFunnelEvent).toHaveBeenCalledOnce();
    expect(JSON.stringify(recordCommunityFunnelEvent.mock.calls)).not.toMatch(
      /owner|user|session/i,
    );
  });
});
