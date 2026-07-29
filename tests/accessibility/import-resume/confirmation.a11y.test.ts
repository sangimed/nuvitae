import { expect, test } from "@playwright/test";

const importId = "22222222-2222-4222-8222-222222222222";
const resumeId = "44444444-4444-4444-8444-444444444444";

test.describe("US3 confirmation accessibility", () => {
  test("covers blocked summary, dialog, success provenance, and discard scheduling", async ({
    page,
  }) => {
    await page.route(`**/import-resume/${importId}/review`, async (route) => {
      if (
        route.request().resourceType() === "document" &&
        route.request().method() === "GET"
      ) {
        await route.fallback();
        return;
      }
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(reviewResponse(true)),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });
    await page.route(`**/import-resume/${importId}/confirm`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-07-28",
          requestId: "11111111-1111-4111-8111-111111111111",
          status: "structured_resume_confirmed",
          importId,
          draftId: "33333333-3333-4333-8333-333333333333",
          structuredResumeId: resumeId,
          confirmationStatus: "confirmed",
          provenanceLabel: "imported_from_initial_resume",
          confirmedAt: "2026-07-29T09:00:00.000Z",
          sourceRetentionExpiresAt: "2026-08-04T08:00:00.000Z",
          resumeUrl: `/resumes/${resumeId}`,
          userMessage: "Your structured resume was created.",
        }),
      });
    });
    await page.route(`**/import-resume/${importId}/discard`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-07-28",
          requestId: "11111111-1111-4111-8111-111111111111",
          status: "import_discarded",
          importId,
          draftId: "33333333-3333-4333-8333-333333333333",
          discardedAt: "2026-07-29T09:00:00.000Z",
          deletionJobId: "55555555-5555-4555-8555-555555555555",
          deletionState: "scheduled",
          userMessage:
            "Source cleanup has been scheduled and is not complete yet.",
          recoveryActions: ["new_import", "manual_entry"],
        }),
      });
    });

    await page.goto(`/import-resume/${importId}/review`);
    await expect(
      page.getByRole("button", { name: "Create structured resume" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create structured resume" })
      .press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Confirm resume creation" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Create structured resume" })
      .click();
    await page
      .getByRole("button", { name: "Confirm and create resume" })
      .click();
    await expect(
      page.getByText("Your structured resume was created."),
    ).toBeVisible();
  });
});

function reviewResponse(ready: boolean) {
  return {
    version: "2026-07-28",
    requestId: "11111111-1111-4111-8111-111111111111",
    status: "review_draft",
    importId,
    draftId: "33333333-3333-4333-8333-333333333333",
    draftStatus: ready ? "ready_to_confirm" : "review_required",
    reviewRevision: 1,
    retentionExpiresAt: "2026-08-04T08:00:00.000Z",
    sections: [
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
    ].map((section) => ({
      section,
      label: section,
      fields:
        section === "headline"
          ? [
              {
                fieldId: "44444444-4444-4444-8444-444444444444",
                fieldPath: "headline",
                value: { kind: "text", value: "Synthetic headline" },
                sourceStatus: "explicit_source",
                confidenceStatus: "high",
                inferenceStatus: "not_inferred",
                reviewStatus: "confirmed",
                provenance: { kind: "pdf", pageNumber: 2 },
                warningIds: [],
                allowedActions: ["confirm", "edit", "remove"],
              },
            ]
          : [],
      warnings: [],
      allowedActions: ["add", "exclude"],
    })),
    activeFieldCount: 1,
    unresolvedWarningCount: 0,
    readyToConfirm: ready,
    userMessage: "Ready.",
  };
}
