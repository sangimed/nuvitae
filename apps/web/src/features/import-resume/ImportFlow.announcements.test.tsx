// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicImportStatusResponse } from "@nuvitae/contracts";
import {
  ImportFlow,
  UnknownImportRecovery,
  announcementForRecoveryState,
  announcementForStatus,
} from "./ImportFlow";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  pollImportStatus: vi.fn(),
  startImportUpload: vi.fn(),
}));

vi.mock("../../services/import-resume/import-status-client", () => ({
  pollImportStatus: mocks.pollImportStatus,
}));
vi.mock("../../services/import-resume/start-import-client", () => ({
  startImportUpload: mocks.startImportUpload,
}));

const importId = "22222222-2222-4222-8222-222222222222";

function statusResponse(
  status: PublicImportStatusResponse["status"],
  overrides: Partial<PublicImportStatusResponse> = {},
): PublicImportStatusResponse {
  return {
    version: "2026-07-28",
    requestId: "11111111-1111-4111-8111-111111111111",
    importId,
    status,
    progressKnown: false,
    allowedRecoveryActions: ["replace_upload", "manual_entry"],
    userMessage: "Status update.",
    ...(status === "processing" ? { currentStep: "checking_document" } : {}),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | undefined;
let emitStatus: ((status: PublicImportStatusResponse) => void) | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  window.history.replaceState(null, "", "/import-resume");
  emitStatus = undefined;
  mocks.startImportUpload.mockReset();
  mocks.pollImportStatus.mockReset();
  mocks.startImportUpload.mockResolvedValue({
    ok: true,
    response: {
      version: "2026-07-28",
      requestId: "11111111-1111-4111-8111-111111111111",
      importId,
      status: "import_initialization",
      uploadStatus: "uploaded",
      retentionExpiresAt: "2026-08-05T09:30:00.000Z",
      manualEntryUrl: "/resumes/new/manual",
      userMessage: "Your resume was uploaded privately.",
    },
  });
  mocks.pollImportStatus.mockImplementation(
    (input: {
      readonly onStatus: (status: PublicImportStatusResponse) => void;
    }) => {
      emitStatus = input.onStatus;
      return Promise.resolve();
    },
  );
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.clearAllMocks();
});

function render(ui: React.ReactNode) {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() => root.render(ui));
}

function liveRegionText(): string {
  return (
    container.querySelector(".import-status-live-region")?.textContent ?? ""
  );
}

async function startUpload() {
  act(() => {
    const choose = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Import my resume"),
    );
    choose?.click();
  });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  const file = new File(["%PDF synthetic selectable text"], "resume.pdf", {
    type: "application/pdf",
  });
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    const submit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Upload and start import"),
    );
    submit?.click();
  });
}

describe("ImportFlow live announcements (T063)", () => {
  it("announces upload acceptance, processing, progress, and review readiness in order", async () => {
    render(<ImportFlow />);
    await startUpload();

    expect(liveRegionText()).toContain("Your file was accepted for import.");

    act(() => {
      emitStatus?.(
        statusResponse("processing", {
          currentStep: "checking_document",
          progressKnown: false,
        }),
      );
    });
    expect(liveRegionText()).toContain(
      "Nuvitae is preparing your resume for review.",
    );

    act(() => {
      emitStatus?.(
        statusResponse("processing", {
          currentStep: "reading_content",
          progressKnown: false,
        }),
      );
    });
    expect(liveRegionText()).toContain("still preparing");
    expect(liveRegionText()).toContain("reading the content");
    expect(liveRegionText()).not.toContain("percent");

    act(() => {
      emitStatus?.(
        statusResponse("processing", {
          currentStep: "organizing_resume_sections",
          progressKnown: true,
          progressPercent: 42,
        }),
      );
    });
    expect(liveRegionText()).toContain("42 percent complete");

    act(() => {
      emitStatus?.(
        statusResponse("draft_ready", {
          progressKnown: true,
          progressPercent: 100,
        }),
      );
    });
    expect(liveRegionText()).toContain(
      "Your resume draft is ready for review.",
    );
  });

  it("does not re-announce identical processing progress updates", async () => {
    render(<ImportFlow />);
    await startUpload();
    act(() => {
      emitStatus?.(
        statusResponse("processing", {
          currentStep: "reading_content",
          progressKnown: false,
        }),
      );
    });
    act(() => {
      emitStatus?.(
        statusResponse("processing", {
          currentStep: "reading_content",
          progressKnown: false,
        }),
      );
    });
    const first = liveRegionText();
    expect(first).toContain("still preparing");
    act(() => {
      emitStatus?.(
        statusResponse("processing", {
          currentStep: "reading_content",
          progressKnown: false,
        }),
      );
    });
    expect(liveRegionText()).toBe(first);
  });

  it("maps every public import status to a safe normalized announcement", () => {
    expect(
      announcementForStatus(
        statusResponse("processing", { currentStep: "checking_document" }),
        false,
      ),
    ).toEqual({ state: "processing_started" });
    expect(
      announcementForStatus(
        statusResponse("processing", {
          currentStep: "reading_content",
          progressKnown: true,
          progressPercent: 42,
        }),
        true,
      ),
    ).toEqual({
      state: "processing_progress",
      progressStep: "reading the content",
      progressKnown: true,
      progressPercent: 42,
    });
    expect(announcementForStatus(statusResponse("draft_ready"), false)).toEqual(
      { state: "review_ready" },
    );
    expect(
      announcementForStatus(statusResponse("partial_extraction"), false),
    ).toEqual({ state: "partial_draft_ready" });
    for (const failing of [
      "recoverable_timeout",
      "validation_failure",
      "terminal_processing_failure",
      "expired",
    ] as const) {
      expect(announcementForStatus(statusResponse(failing), false)).toEqual({
        state: "processing_failed",
      });
    }
    expect(announcementForStatus(statusResponse("cancelled"), false)).toEqual({
      state: "cancellation_completed",
    });
    for (const unmapped of [
      "authentication_required",
      "connectivity_lost",
      "not_found",
    ] as const) {
      expect(announcementForStatus(statusResponse(unmapped), false)).toEqual({
        state: "unknown",
      });
    }
  });

  it("maps provider recovery states to provider-neutral announcements", () => {
    expect(announcementForRecoveryState("no_provider")).toBe(
      "provider_connection_required",
    );
    expect(announcementForRecoveryState("disconnected")).toBe(
      "provider_connection_required",
    );
    expect(announcementForRecoveryState("authentication_expired")).toBe(
      "provider_connection_required",
    );
    expect(announcementForRecoveryState("provider_unavailable")).toBe(
      "provider_unavailable",
    );
    expect(announcementForRecoveryState("rate_limited")).toBe(
      "provider_unavailable",
    );
    expect(announcementForRecoveryState("timeout")).toBe(
      "provider_unavailable",
    );
    expect(announcementForRecoveryState("malformed_output")).toBe(
      "processing_failed",
    );
    expect(announcementForRecoveryState("unknown")).toBe("unknown");
  });
});

describe("ImportFlow route recovery", () => {
  it("starts one attempt and never restarts it across recovered remounts", async () => {
    render(<ImportFlow />);
    await startUpload();

    expect(window.location.pathname).toBe(`/import-resume/${importId}`);
    expect(mocks.startImportUpload).toHaveBeenCalledTimes(1);

    act(() => root?.unmount());
    root = undefined;
    render(<ImportFlow importId={importId} />);
    act(() => root?.unmount());
    root = undefined;
    render(<ImportFlow importId={importId} />);

    expect(mocks.startImportUpload).toHaveBeenCalledTimes(1);
  });

  it("observes an existing import without starting another upload", () => {
    render(<ImportFlow importId={importId} />);

    expect(container.textContent).toContain("Preparing your resume for review");
    expect(mocks.pollImportStatus).toHaveBeenCalledWith(
      expect.objectContaining({ importId }),
    );
    expect(mocks.startImportUpload).not.toHaveBeenCalled();
  });

  it("restores the existing completed and failed states", () => {
    render(<ImportFlow importId={importId} />);
    act(() => {
      emitStatus?.(
        statusResponse("draft_ready", {
          progressKnown: true,
          progressPercent: 100,
          draftSummary: {
            draftId: "33333333-3333-4333-8333-333333333333",
            retentionExpiresAt: "2026-08-05T09:30:00.000Z",
            fieldCount: 4,
            warningCount: 0,
          },
        }),
      );
    });
    expect(container.textContent).toContain("Your resume draft is ready");

    act(() => root?.unmount());
    root = undefined;
    render(<ImportFlow importId={importId} />);
    act(() => {
      emitStatus?.(
        statusResponse("terminal_processing_failure", {
          failure: {
            code: "terminal_failure",
            retryable: false,
            recoveryActions: ["replace_upload", "manual_entry"],
            userMessage: "This import failed.",
          },
        }),
      );
    });
    expect(container.textContent).toContain(
      "This resume could not be prepared",
    );
    expect(container.textContent).toContain("This import failed.");
    expect(mocks.startImportUpload).not.toHaveBeenCalled();
  });

  it("returns genuinely missing imports to the chooser", () => {
    render(<ImportFlow importId={importId} />);
    act(() => emitStatus?.(statusResponse("not_found")));

    expect(window.location.pathname).toBe("/import-resume");
    expect(container.textContent).toContain("Start from your existing resume");
  });
});

describe("ImportFlow unknown-state fail-safe (T063)", () => {
  it("renders a generic recovery panel with safe actions and intentional focus", () => {
    const onReplaceUpload = vi.fn();
    const onManualEntry = vi.fn();
    render(
      <UnknownImportRecovery
        onReplaceUpload={onReplaceUpload}
        onManualEntry={onManualEntry}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("We could not prepare this resume for review");
    expect(text).not.toContain("Try again");
    expect(text).toContain("Upload a different file");
    expect(text).toContain("Enter manually");
    expect(text).not.toContain("diagnostic");
    expect(text).not.toContain("internal");
    expect(document.activeElement).toBe(
      container.querySelector("section[tabindex='-1']"),
    );
    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) =>
          button.textContent?.includes("Upload a different file"),
        )
        ?.click();
    });
    expect(onReplaceUpload).toHaveBeenCalledTimes(1);
  });
});
