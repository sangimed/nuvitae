// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmedStructuredResumeReadResponse } from "@nuvitae/contracts";
import { ResumeExportView } from "./ResumeExportView";
import { LanguageSelector, LocaleProvider } from "../../i18n/LocaleProvider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  readConfirmedStructuredResume: vi.fn(),
}));

vi.mock("../import-resume/client", () => ({
  readConfirmedStructuredResume: mocks.readConfirmedStructuredResume,
}));

const resumeId = "44444444-4444-4444-8444-444444444444";
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  mocks.readConfirmedStructuredResume.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function renderView(
  initialLocale: "en" | "fr" | "ar" = "en",
  includeLanguageSelector = false,
) {
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <LocaleProvider initialLocale={initialLocale}>
        {includeLanguageSelector ? <LanguageSelector /> : null}
        <ResumeExportView resumeId={resumeId} />
      </LocaleProvider>,
    );
  });
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(name),
  );
  expect(found, `button ${name}`).toBeDefined();
  return found as HTMLButtonElement;
}

describe("ResumeExportView", () => {
  it("switches export copy in place without mutating the loaded resume", async () => {
    mocks.readConfirmedStructuredResume.mockResolvedValue({
      ok: true,
      response: confirmedResume(),
    });

    await renderView("en", true);
    const resume = container.querySelector("article");
    const resumeContent = resume?.textContent;
    const select = container.querySelector("select")!;

    await act(async () => {
      select.value = "fr";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "Votre PDF est prêt à être enregistré",
    );
    expect(container.querySelector("article")).toBe(resume);
    expect(resume?.textContent).toBe(resumeContent);
    expect(mocks.readConfirmedStructuredResume).toHaveBeenCalledTimes(1);
  });

  it("localizes export controls for French and Arabic without changing resume content", async () => {
    mocks.readConfirmedStructuredResume.mockResolvedValue({
      ok: true,
      response: confirmedResume(),
    });

    await renderView("fr");
    expect(container.textContent).toContain(
      "Votre PDF est prêt à être enregistré",
    );
    expect(container.textContent).toContain("Jordan Avery");

    await act(async () => root?.unmount());
    root = undefined;
    container.replaceChildren();
    await renderView("ar");
    expect(container.textContent).toContain("ملف PDF جاهز للحفظ");
    expect(container.textContent).toContain("Jordan Avery");
    expect(container.querySelector("article")?.getAttribute("dir")).toBe(
      "auto",
    );
  });

  it("uses the canonical semantic renderer and reports native PDF export success", async () => {
    mocks.readConfirmedStructuredResume.mockResolvedValue({
      ok: true,
      response: confirmedResume(),
    });
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);

    await renderView();

    expect(container.textContent).toContain("Your PDF is ready to save");
    expect(container.textContent).toContain("Jordan Avery");
    expect(container.textContent).toContain("Experience");
    expect(
      container.querySelector('[data-resume-template="professional"]'),
    ).not.toBeNull();
    expect(
      mocks.readConfirmedStructuredResume.mock.calls[0]?.[0],
    ).toMatchObject({ resumeId });

    await act(async () => {
      button("Save as PDF").click();
      await new Promise((resolve) => window.setTimeout(resolve, 1));
    });

    expect(print).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      "The print dialog closed. Your resume remains unchanged.",
    );
  });

  it("shows a privacy-safe recoverable failure and can retry without printing", async () => {
    mocks.readConfirmedStructuredResume
      .mockResolvedValueOnce({
        ok: false,
        category: "temporarily_unavailable",
        message: "Connection temporarily lost.",
      })
      .mockResolvedValueOnce({ ok: true, response: confirmedResume() });
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);

    await renderView();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "PDF export is temporarily unavailable. Please try again.",
    );
    expect(container.textContent).not.toContain("Connection temporarily lost.");
    expect(container.textContent).not.toContain("Jordan Avery");
    expect(print).not.toHaveBeenCalled();

    await act(async () => button("Try again").click());

    expect(container.textContent).toContain("Jordan Avery");
    expect(mocks.readConfirmedStructuredResume).toHaveBeenCalledTimes(2);
    expect(print).not.toHaveBeenCalled();
  });

  it("bounds preparation time, aborts the read, and preserves a retry path", async () => {
    vi.useFakeTimers();
    mocks.readConfirmedStructuredResume.mockImplementation(
      () => new Promise(() => undefined),
    );

    await renderView();
    expect(container.textContent).toContain("Preparing your PDF");

    await act(async () => vi.advanceTimersByTime(15_000));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "PDF export is temporarily unavailable. Please try again.",
    );
    expect(button("Try again")).toBeDefined();
    const request = mocks.readConfirmedStructuredResume.mock.calls[0]?.[0] as
      { signal?: AbortSignal } | undefined;
    expect(request?.signal?.aborted).toBe(true);
  });
});

function confirmedResume(): ConfirmedStructuredResumeReadResponse {
  const sourced = (value: string) => ({
    value,
    sourceStatus: "explicit_source" as const,
    confidenceStatus: "high" as const,
    inferenceStatus: "not_inferred" as const,
    provenance: { kind: "pdf" as const, pageNumber: 1 },
  });
  return {
    version: "2026-07-28",
    requestId: "11111111-1111-4111-8111-111111111111",
    status: "confirmed_structured_resume",
    structuredResumeId: resumeId,
    confirmationStatus: "confirmed",
    provenanceLabel: "imported_from_initial_resume",
    content: {
      personal: [sourced("Jordan Avery")],
      contact: [sourced("jordan@example.test")],
      headline: sourced("Software Engineer"),
      summary: sourced("Builds reliable products."),
      workExperiences: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          employerName: "Nova Systems",
          roles: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              title: "Senior Engineer",
              isOngoing: true,
              responsibilities: [sourced("Led platform delivery")],
              achievements: [],
            },
          ],
        },
      ],
      education: [],
      skills: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          name: sourced("TypeScript"),
        },
      ],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    createdAt: "2026-08-22T09:00:00.000Z",
    updatedAt: "2026-08-22T09:00:00.000Z",
    sourceAvailability: "source_no_longer_available",
    userMessage: "Loaded.",
  };
}
