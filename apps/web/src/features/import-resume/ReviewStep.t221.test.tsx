// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewDraftReadResponse } from "@nuvitae/contracts";
import { ReviewStep } from "./ReviewStep";
import { LocaleProvider } from "../../i18n/LocaleProvider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  readReviewDraft: vi.fn(),
  sendReviewMutation: vi.fn(),
}));

vi.mock("../../services/import-resume/review-client", () => ({
  readReviewDraft: mocks.readReviewDraft,
  sendReviewMutation: mocks.sendReviewMutation,
  createReviewOperationId: () => "77777777-7777-4777-8777-777777777777",
  createReviewMutationRequest: (input: unknown) => input,
}));

vi.mock("../../services/import-resume/import-timing-client", () => ({
  recordImportTiming: vi.fn(),
}));

const importId = "22222222-2222-4222-8222-222222222222";
const summaryId = "33333333-3333-4333-8333-333333333333";

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = undefined;
});

async function render(draft = syntheticDraft(), locale: "en" | "es" = "en") {
  mocks.readReviewDraft.mockResolvedValue({ ok: true, response: draft });
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <LocaleProvider initialLocale={locale}>
        <ReviewStep importId={importId} />
      </LocaleProvider>,
    );
  });
}

function button(name: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(name),
  );
  expect(result).toBeDefined();
  return result as HTMLButtonElement;
}

describe("T221 simplified review", () => {
  it("keeps verified information calm and gives normal long-form review work an explicit confirmation", async () => {
    await render();

    expect(container.textContent).toContain("Imported from your resume.");
    expect(container.textContent).toContain(
      "Confirmation needed before this information is used.",
    );
    expect(container.textContent).toContain(
      "Found in your resume — your confirmation is needed",
    );
    expect(container.textContent).toContain("Example employer");
    expect(container.textContent).toContain("Example role");
    expect(container.textContent).toContain("Professional summary");
    expect(container.textContent).not.toContain("inferred_needs_review");
    expect(container.textContent).not.toContain("review_required");
    expect(
      document.getElementById("summary-review-heading")?.textContent,
    ).toContain("Professional summary");
    expect(
      container.querySelectorAll(".review-field-needs-confirmation"),
    ).toHaveLength(3);
    expect(container.textContent).toContain("Confirm this information");
    expect(
      container.querySelector(".review-field-accepted button.primary-action"),
    ).toBeNull();
  });

  it("opens sections with outstanding review work and collapses ready sections by default", async () => {
    await render();

    expect(
      document
        .getElementById("summary-review-heading")
        ?.closest("details")
        ?.hasAttribute("open"),
    ).toBe(true);
    expect(
      document
        .getElementById("personal-review-heading")
        ?.closest("details")
        ?.hasAttribute("open"),
    ).toBe(false);
  });

  it("accepts all grounded suggestions in one explicit action", async () => {
    const initial = syntheticDraft();
    const accepted = {
      ...initial,
      reviewRevision: initial.reviewRevision + 1,
      sections: initial.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) =>
          field.inferenceStatus === "inferred_needs_review"
            ? {
                ...field,
                reviewStatus: "confirmed" as const,
                inferenceStatus: "confirmed_inference" as const,
              }
            : field,
        ),
        warnings: section.warnings.map((warning) =>
          warning.fieldPath !== undefined
            ? { ...warning, reviewStatus: "confirmed" as const }
            : warning,
        ),
      })),
    };
    mocks.sendReviewMutation.mockResolvedValue({
      ok: true,
      response: { draft: accepted, userMessage: "Suggestions accepted." },
    });
    await render(initial);

    await act(async () => button("Accept all 3 suggested details").click());

    expect(mocks.sendReviewMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          action: {
            type: "confirm_inferred_fields",
            fieldIds: [
              summaryId,
              "88888888-8888-4888-8888-888888888888",
              "99999999-9999-4999-8999-999999999999",
            ],
          },
        }),
      }),
    );
    expect(container.textContent).not.toContain(
      "Accept all 3 suggested details",
    );
    expect(container.textContent).toContain("Changes saved.");
  });

  it("localizes review status and ignores server-provided prose", async () => {
    mocks.readReviewDraft.mockResolvedValue({
      ok: true,
      response: {
        ...syntheticDraft(),
        userMessage: "UNTRUSTED_SERVER_REVIEW_MESSAGE",
      },
    });
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <LocaleProvider initialLocale="es">
          <ReviewStep importId={importId} />
        </LocaleProvider>,
      );
    });

    expect(container.textContent).toContain("Revisión cargada.");
    expect(container.textContent).not.toContain(
      "UNTRUSTED_SERVER_REVIEW_MESSAGE",
    );
  });

  it("localizes categorized review errors and ignores server error prose", async () => {
    await render(syntheticDraft(), "es");
    mocks.sendReviewMutation.mockResolvedValue({
      ok: false,
      category: "temporarily_unavailable",
      message: "UNTRUSTED_SERVER_ERROR_MESSAGE",
    });

    await act(async () => button("Confirm this information").click());

    expect(container.textContent).toContain(
      "La revisión no está disponible temporalmente. Inténtalo más tarde.",
    );
    expect(container.textContent).not.toContain(
      "UNTRUSTED_SERVER_ERROR_MESSAGE",
    );
  });

  it("confirms a review-required field through the canonical field and linked-warning commands, then renders the persisted state", async () => {
    const initial = syntheticDraft();
    const afterFieldConfirmation = withSummaryState(
      initial,
      "confirmed",
      "needs_review",
    );
    const afterWarningConfirmation = withSummaryState(
      initial,
      "confirmed",
      "confirmed",
    );
    mocks.sendReviewMutation
      .mockResolvedValueOnce({
        ok: true,
        response: { draft: afterFieldConfirmation, userMessage: "Saved." },
      })
      .mockResolvedValueOnce({
        ok: true,
        response: { draft: afterWarningConfirmation, userMessage: "Saved." },
      });
    await render(initial);

    await act(async () => button("Confirm this information").click());
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
    });

    expect(
      mocks.sendReviewMutation.mock.calls.map(([call]) => call.request.action),
    ).toEqual([
      { type: "confirm_field", fieldId: summaryId },
      {
        type: "resolve_warning",
        warningId: "44444444-4444-4444-8444-444444444444",
        resolution: "confirmed",
      },
    ]);
    const summary = document
      .getElementById(`${summaryId}-label`)
      ?.closest("article");
    expect(summary?.textContent).toContain("Accepted for your resume.");
    expect(summary?.textContent).not.toContain(
      "Confirmation needed before this information is used.",
    );
    expect(document.activeElement?.id).toBe(
      "88888888-8888-4888-8888-888888888888-label",
    );
    expect(
      container.querySelector("[aria-label='Imported resume preview']"),
    ).toBeNull();
  });

  it("keeps review controls available without an effective resume preview", async () => {
    const unavailable = { ...syntheticDraft(), effectiveResume: undefined };
    await render(unavailable);

    expect(container.textContent).toContain("Confirm this information");
    expect(
      container.querySelector("[aria-label='Imported resume preview']"),
    ).toBeNull();
  });

  it("does not render a resume preview during import review", async () => {
    await render();

    expect(
      container.querySelector("[aria-label='Imported resume preview']"),
    ).toBeNull();
  });

  it("keeps inline editing recoverable with a labelled edit field and cancel action", async () => {
    await render();
    const personal = document
      .getElementById("12121212-1212-4121-8121-121212121212-label")
      ?.closest("article");
    const edit = Array.from(personal?.querySelectorAll("button") ?? []).find(
      (item) => item.textContent?.includes("Edit field"),
    ) as HTMLButtonElement;

    act(() => edit.click());
    const input = personal?.querySelector("textarea") as HTMLTextAreaElement;
    expect(input.labels?.[0]?.textContent).toContain("Edit value");
    act(() => {
      input.value = "Changed synthetic person";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() =>
      Array.from(personal?.querySelectorAll("button") ?? [])
        .find((item) => item.textContent?.includes("Cancel edit"))
        ?.click(),
    );
    expect(personal?.textContent).toContain("Synthetic person");
    expect(personal?.querySelector("textarea")).toBeNull();
  });

  it("does not render rejected provider text as a candidate", async () => {
    await render();

    expect(container.textContent).toContain("Information not included");
    expect(container.textContent).toContain(
      "could not safely use some information",
    );
    expect(container.textContent).not.toContain("UNSAFE_PROVIDER_CANDIDATE");
    const recovery = Array.from(container.querySelectorAll("article")).find(
      (item) => item.textContent?.includes("Information not included"),
    );
    expect(recovery?.textContent).toContain("Leave out for now");
    expect(recovery?.textContent).not.toContain("Edit information");
    expect(recovery?.textContent).not.toContain("Confirm");
  });
});

function syntheticDraft(): ReviewDraftReadResponse {
  const sections = [
    "personal",
    "contact",
    "headline",
    "summary",
    "work_experience",
    "education",
    "skills",
    "languages",
    "projects",
    "certifications",
    "professional_links",
  ] as const;
  return {
    version: "2026-07-28",
    requestId: "11111111-1111-4111-8111-111111111111",
    status: "review_draft",
    importId,
    draftId: "55555555-5555-4555-8555-555555555555",
    draftStatus: "review_required",
    reviewRevision: 4,
    retentionExpiresAt: "2026-09-01T09:00:00.000Z",
    activeFieldCount: 5,
    unresolvedWarningCount: 3,
    readyToConfirm: false,
    userMessage: "Review the information that needs your attention.",
    effectiveResume: effectiveResume(),
    sections: sections.map((section) => ({
      section,
      label: section === "work_experience" ? "Work experience" : section,
      fields:
        section === "personal"
          ? [verifiedField()]
          : section === "summary"
            ? [
                reviewRequiredField(
                  summaryId,
                  "summary",
                  "Synthetic summary about accessible product delivery.",
                ),
              ]
            : section === "work_experience"
              ? [
                  verifiedField(
                    "66666666-6666-4666-8666-666666666666",
                    "work_experience.0.employer",
                    "Example employer",
                  ),
                  verifiedField(
                    "77777777-7777-4777-8777-777777777777",
                    "work_experience.0.roles.0.title",
                    "Example role",
                  ),
                  reviewRequiredField(
                    "88888888-8888-4888-8888-888888888888",
                    "work_experience.0.roles.0.responsibility",
                    "Led a synthetic cross-functional initiative.",
                  ),
                  reviewRequiredField(
                    "99999999-9999-4999-8999-999999999999",
                    "work_experience.0.roles.0.responsibility_1",
                    "Improved a synthetic customer workflow.",
                  ),
                ]
              : [],
      warnings:
        section === "summary"
          ? [
              {
                warningId: "44444444-4444-4444-8444-444444444444",
                warningType: "ambiguous" as const,
                section,
                fieldPath: "summary",
                message: "This information needs your confirmation.",
                severity: "needs_attention" as const,
                reviewStatus: "needs_review" as const,
                requiresResolution: true,
                allowedActions: [
                  "confirm",
                  "edit",
                  "exclude",
                  "intentionally_leave",
                ] as const,
              },
            ]
          : section === "projects"
            ? [
                {
                  warningId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  warningType: "unsupported" as const,
                  section,
                  message: "UNSAFE_PROVIDER_CANDIDATE",
                  severity: "needs_attention" as const,
                  reviewStatus: "needs_review" as const,
                  requiresResolution: true,
                  allowedActions: [
                    "confirm",
                    "edit",
                    "exclude",
                    "intentionally_leave",
                  ] as const,
                },
              ]
            : [],
      allowedActions: ["add", "exclude"] as const,
    })),
  };
}

function verifiedField(
  fieldId = "12121212-1212-4121-8121-121212121212",
  fieldPath = "personal.name",
  value = "Synthetic person",
) {
  return {
    fieldId,
    fieldPath,
    value: { kind: "text" as const, value },
    sourceStatus: "explicit_source" as const,
    confidenceStatus: "high" as const,
    inferenceStatus: "not_inferred" as const,
    reviewStatus: "unreviewed" as const,
    provenance: { kind: "pdf" as const, pageNumber: 1 },
    warningIds: [],
    allowedActions: ["confirm", "edit", "remove"] as const,
  };
}

function reviewRequiredField(
  fieldId: string,
  fieldPath: string,
  value: string,
) {
  return {
    ...verifiedField(fieldId, fieldPath, value),
    inferenceStatus: "inferred_needs_review" as const,
    warningIds:
      fieldPath === "summary" ? ["44444444-4444-4444-8444-444444444444"] : [],
    provenance: {
      kind: "inferred" as const,
      needsConfirmation: true,
      original: { kind: "pdf" as const, pageNumber: 1 },
    },
  };
}

function withSummaryState(
  draft: ReviewDraftReadResponse,
  fieldState: "unreviewed" | "confirmed",
  warningState: "needs_review" | "confirmed",
): ReviewDraftReadResponse {
  return {
    ...draft,
    effectiveResume:
      fieldState === "confirmed"
        ? {
            ...effectiveResume(),
            summary: sourcedText(
              "Synthetic summary about accessible product delivery.",
              "confirmed_inference",
            ),
          }
        : effectiveResume(),
    reviewRevision: warningState === "confirmed" ? 6 : 5,
    unresolvedWarningCount: warningState === "confirmed" ? 2 : 3,
    sections: draft.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.fieldId === summaryId
          ? {
              ...field,
              reviewStatus: fieldState,
              inferenceStatus:
                fieldState === "confirmed"
                  ? ("confirmed_inference" as const)
                  : field.inferenceStatus,
            }
          : field,
      ),
      warnings: section.warnings.map((warning) =>
        warning.warningId === "44444444-4444-4444-8444-444444444444"
          ? { ...warning, reviewStatus: warningState }
          : warning,
      ),
    })),
  };
}

function effectiveResume() {
  return {
    personal: [sourcedText("Synthetic person")],
    contact: [],
    workExperiences: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        employerName: "Example employer",
        roles: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            title: "Example role",
            isOngoing: false,
            responsibilities: [],
            achievements: [],
          },
        ],
      },
    ],
    education: [],
    skills: [],
    languages: [],
    projects: [],
    certifications: [],
    professionalLinks: [],
  } as const;
}

function sourcedText(
  value: string,
  inferenceStatus: "not_inferred" | "confirmed_inference" = "not_inferred",
) {
  return {
    value,
    sourceStatus: "explicit_source" as const,
    confidenceStatus: "high" as const,
    inferenceStatus,
    provenance: { kind: "pdf" as const, pageNumber: 1 },
  };
}
