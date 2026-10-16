// @vitest-environment jsdom

import { act, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ImportStatusLiveRegion,
  assertiveAnnouncementStates,
  composeAnnouncement,
  defaultAnnouncementText,
  toPublicAnnouncement,
  type ImportLiveRegionState,
} from "./ImportStatusLiveRegion";
import { messageKeyForAnnouncement } from "./ImportFlow";
import {
  LanguageSelector,
  LocaleProvider,
  useTranslation,
} from "../../i18n/LocaleProvider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

function render(ui: ReactNode) {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() => root.render(ui));
}

function region(): HTMLDivElement {
  return container.querySelector("div")!;
}

function LocalizedStatus() {
  const [resumeContent, setResumeContent] = useState("مهندسة — Paris — 中文");
  const { locale, t } = useTranslation();
  return (
    <>
      <LanguageSelector />
      <ImportStatusLiveRegion
        state="review_ready"
        defaultText={t(messageKeyForAnnouncement("review_ready"))}
      />
      <input
        aria-label="Resume content"
        dir="auto"
        value={resumeContent}
        onChange={(event) => setResumeContent(event.currentTarget.value)}
      />
      <output>{locale}</output>
    </>
  );
}

const allStates: readonly ImportLiveRegionState[] = [
  "upload_accepted",
  "validation_started",
  "processing_started",
  "processing_progress",
  "provider_connection_required",
  "provider_unavailable",
  "limited_deterministic_fallback_started",
  "partial_draft_ready",
  "review_ready",
  "processing_failed",
  "retry_started",
  "cancellation_completed",
  "source_deletion_completed",
  "unknown",
];

describe("ImportStatusLiveRegion (T061)", () => {
  it("uses the active locale for stable status text without changing resume content", async () => {
    render(
      <LocaleProvider initialLocale="fr">
        <LocalizedStatus />
      </LocaleProvider>,
    );
    expect(
      container.querySelector(".import-status-live-region")?.textContent,
    ).toBe("Votre brouillon de CV est prêt à être vérifié.");
    const input = container.querySelector("input")!;
    const select = container.querySelector("select")!;
    await act(async () => {
      select.value = "ar";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      container.querySelector(".import-status-live-region")?.textContent,
    ).toBe("مسودة سيرتك الذاتية جاهزة للمراجعة.");
    expect(document.documentElement.dir).toBe("rtl");
    expect(input.value).toBe("مهندسة — Paris — 中文");
    expect(input.dir).toBe("auto");
  });

  it("announces deterministic provider-neutral text for every supported state", () => {
    for (const state of allStates) {
      const expected = defaultAnnouncementText[state];
      expect(composeAnnouncement({ state })).toBe(expected);
      expect(expected.length).toBeGreaterThan(0);
    }
  });

  it("announces each state through the rendered live region", () => {
    for (const state of allStates) {
      render(<ImportStatusLiveRegion state={state} />);
      expect(region().textContent).toBe(defaultAnnouncementText[state]);
    }
  });

  it("updates the announcement when the status transitions", () => {
    render(<ImportStatusLiveRegion state="processing_started" />);
    expect(region().textContent).toBe(
      "Nuvitae is preparing your resume for review.",
    );
    render(<ImportStatusLiveRegion state="review_ready" />);
    expect(region().textContent).toBe("Your resume draft is ready for review.");
    render(<ImportStatusLiveRegion state="processing_started" />);
    expect(region().textContent).toBe(
      "Nuvitae is preparing your resume for review.",
    );
  });

  it("suppresses duplicate announcements for repeated identical states", () => {
    render(<ImportStatusLiveRegion state="processing_progress" />);
    const first = region().textContent;
    render(<ImportStatusLiveRegion state="processing_progress" />);
    expect(region().textContent).toBe(first);
    expect(region().textContent).toBe(
      "Nuvitae is still preparing your resume for review.",
    );
  });

  it("uses polite status semantics for routine updates", () => {
    render(<ImportStatusLiveRegion state="review_ready" />);
    expect(region().getAttribute("role")).toBe("status");
    expect(region().getAttribute("aria-live")).toBe("polite");
    expect(region().getAttribute("aria-atomic")).toBe("true");
  });

  it("uses assertive alert semantics only for blocking urgent failures", () => {
    expect(assertiveAnnouncementStates).toEqual(new Set(["processing_failed"]));
    render(<ImportStatusLiveRegion state="processing_failed" />);
    expect(region().getAttribute("role")).toBe("alert");
    expect(region().getAttribute("aria-live")).toBe("assertive");
  });

  it("allows callers to override assertiveness explicitly", () => {
    render(<ImportStatusLiveRegion state="review_ready" assertive />);
    expect(region().getAttribute("role")).toBe("alert");
    expect(region().getAttribute("aria-live")).toBe("assertive");
    render(
      <ImportStatusLiveRegion state="processing_failed" assertive={false} />,
    );
    expect(region().getAttribute("role")).toBe("status");
    expect(region().getAttribute("aria-live")).toBe("polite");
  });

  it("announces a localized processing step without dynamically formatting progress", () => {
    render(
      <ImportStatusLiveRegion
        state="processing_progress"
        progressStep="checking the document"
      />,
    );
    expect(region().textContent).toContain("checking the document");
    expect(region().textContent).not.toContain("percent");

    render(
      <ImportStatusLiveRegion
        state="processing_progress"
        progressStep="reading the content"
      />,
    );
    expect(region().textContent).toContain("reading the content");
    expect(region().textContent).not.toContain("42");
    expect(region().textContent).not.toContain("percent complete");
  });

  it("never announces technical codes, diagnostics, paths, or private data", () => {
    const forbidden = [
      "OAuth",
      "model",
      "prompt",
      "credential",
      "token",
      "session",
      "endpoint",
      "config",
      "diagnostic",
      "JSON",
      "api key",
      "codex",
      "openai",
      "ERR_",
      "%",
      "/private/",
      "secret",
    ];
    for (const state of allStates) {
      const text = composeAnnouncement({ state }).toLowerCase();
      for (const term of forbidden) {
        expect(text).not.toContain(term.toLowerCase());
      }
    }
    const technicalMessage =
      "ERR_401 provider=/codex/internal session-id=abc123";
    expect(toPublicAnnouncement("processing_failed", technicalMessage)).toBe(
      undefined,
    );
    render(
      <ImportStatusLiveRegion
        state="processing_failed"
        message={technicalMessage}
      />,
    );
    expect(region().textContent).toBe(
      defaultAnnouncementText.processing_failed,
    );
    expect(region().textContent).not.toContain("ERR_401");
    expect(region().textContent).not.toContain("codex");
  });

  it("uses the normalized caller message only when it is public plain text", () => {
    const onMessage = "Your file was accepted. We will check it next.";
    render(
      <ImportStatusLiveRegion state="upload_accepted" message={onMessage} />,
    );
    expect(region().textContent).toBe(onMessage);
  });

  it("falls back to a deterministic message for unknown states", () => {
    render(
      <ImportStatusLiveRegion
        state={"unexpected_internal_state" as ImportLiveRegionState}
      />,
    );
    expect(region().textContent).toBe("The import status changed.");
    expect(region().getAttribute("role")).toBe("status");
    expect(region().getAttribute("aria-live")).toBe("polite");
  });

  it("renders the supplied id for external labelling", () => {
    render(<ImportStatusLiveRegion state="review_ready" id="status-123" />);
    expect(region().getAttribute("id")).toBe("status-123");
  });
});
