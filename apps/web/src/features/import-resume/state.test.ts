import { describe, expect, it } from "vitest";

import {
  initialImportState,
  isTransitionAllowed,
  transitionImportState,
} from "./state.js";

describe("import resume client state machine", () => {
  it("routes unauthenticated upload choice to authentication required", () => {
    expect(
      transitionImportState(initialImportState, {
        type: "choose_import",
        authenticated: false,
      }),
    ).toEqual({
      state: "authentication_required",
      returnTo: "/import-resume",
    });
  });

  it("allows the normal validation to review-ready path", () => {
    const upload = transitionImportState(initialImportState, {
      type: "choose_import",
      authenticated: true,
    });
    const validating = transitionImportState(upload!, {
      type: "start_validation",
      importId: "import-1",
    });
    const queued = transitionImportState(validating!, {
      type: "validation_accepted",
    });
    const extracting = transitionImportState(queued!, {
      type: "extraction_started",
    });
    const review = transitionImportState(extracting!, {
      type: "draft_ready",
      draftId: "draft-1",
      unresolvedWarningCount: 2,
    });

    expect(review).toEqual({
      state: "review_ready",
      importId: "import-1",
      draftId: "draft-1",
      unresolvedWarningCount: 2,
    });
  });

  it("represents timeout with recovery actions and optional partial draft", () => {
    const timeout = transitionImportState(
      {
        state: "extracting",
        importId: "import-1",
        progress: { known: false, label: "reading_content" },
        retryAvailable: false,
      },
      { type: "timeout", draftId: "draft-1" },
    );

    expect(timeout).toEqual({
      state: "recoverable_timeout",
      importId: "import-1",
      draftId: "draft-1",
      recoveryActions: ["retry", "replace_upload", "manual_entry"],
    });
  });

  it("keeps unsupported-language contact preview separate from review drafts", () => {
    const preview = transitionImportState(
      {
        state: "extracting",
        importId: "import-1",
        progress: { known: false, label: "reading_content" },
        retryAvailable: false,
      },
      {
        type: "unsupported_language_contact_preview",
        previewId: "preview-1",
        contactFieldCount: 2,
      },
    );

    expect(preview).toMatchObject({
      state: "unsupported_language_contact_preview",
      previewId: "preview-1",
      recoveryActions: ["replace_upload", "discard", "manual_entry"],
    });
    expect(preview).not.toHaveProperty("draftId");
  });

  it("forbids impossible transitions", () => {
    expect(
      isTransitionAllowed(initialImportState, {
        type: "draft_ready",
        draftId: "draft-1",
        unresolvedWarningCount: 0,
      }),
    ).toBe(false);
    expect(
      isTransitionAllowed(
        {
          state: "terminal_failure",
          importId: "import-1",
          reason: "unexpected",
          recoveryActions: ["manual_entry"],
        },
        { type: "retry" },
      ),
    ).toBe(false);
  });

  it("distinguishes retry, replacement upload, discard, and manual-entry actions", () => {
    const retry = transitionImportState(
      {
        state: "retryable_failure",
        importId: "import-1",
        reason: "processing_failure",
        recoveryActions: ["retry", "replace_upload", "discard", "manual_entry"],
      },
      { type: "retry" },
    );
    const replacement = transitionImportState(retry!, {
      type: "replace_upload",
    });
    const manual = transitionImportState(retry!, {
      type: "choose_manual_entry",
    });

    expect(retry).toMatchObject({ state: "queued", importId: "import-1" });
    expect(replacement).toEqual({ state: "upload_selection" });
    expect(manual).toEqual({
      state: "manual_entry_handoff",
      source: "failure_recovery",
    });
  });
});
