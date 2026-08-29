import { expect, test } from "@playwright/test";

const importId = "22222222-2222-4222-8222-222222222222";
const fieldId = "44444444-4444-4444-8444-444444444444";
const warningId = "55555555-5555-4555-8555-555555555555";

test.describe("import review accessibility", () => {
  test("supports keyboard review actions, warnings, provenance, and ready state with confirmation control", async ({
    page,
  }) => {
    let revision = 0;
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
          body: JSON.stringify(reviewResponse(revision, false)),
        });
        return;
      }
      revision += 1;
      const ready = revision >= 2;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-07-28",
          requestId: "11111111-1111-4111-8111-111111111111",
          status: "review_updated",
          importId,
          draftId: "33333333-3333-4333-8333-333333333333",
          reviewRevision: revision,
          draft: reviewResponse(revision, ready),
          userMessage: "Your review change was saved.",
        }),
      });
    });

    await page.goto(`/import-resume/${importId}/review`);
    await expect(
      page.getByRole("heading", {
        name: "Check the information Nuvitae needs you to confirm",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Professional summary",
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    const provenance = page.locator(
      ".review-field-needs-confirmation .review-field-provenance",
    );
    await provenance.getByText("Why am I seeing this?").click();
    await expect(
      provenance.getByText(
        "Found in your resume — your confirmation is needed",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Confirmation needed before this information is used."),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Confirm this information" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await page.keyboard.press("Tab");
    await expectFocusedElementHasVisibleFocus(page);
    await page
      .getByRole("button", { name: "Confirm this information" })
      .press("Enter");
    await expect(page.getByText("Your review change was saved.")).toBeVisible();
    await expect(page.getByText("Accepted for your resume.")).toBeVisible();
    await page.getByRole("button", { name: "Edit field" }).press("Enter");
    await expect(page.getByLabel("Edit value")).toBeVisible();
    await page.getByRole("button", { name: "Cancel edit" }).press("Enter");
    await page.getByRole("button", { name: "Edit field" }).press("Enter");
    await page.getByLabel("Edit value").fill("Edited synthetic summary");
    await page.getByRole("button", { name: "Save change" }).press("Enter");
    await page
      .getByRole("button", { name: "Leave out", exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "Add information" })
      .first()
      .press("Enter");
    await page
      .getByRole("button", { name: "Exclude section" })
      .first()
      .press("Enter");

    await expect(
      page.getByRole("button", { name: "Create my resume" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Confirmation is blocked" }),
    ).toHaveCount(0);
  });
});

function reviewResponse(reviewRevision: number, readyToConfirm: boolean) {
  const sectionNames = [
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
  ];
  return {
    version: "2026-07-28",
    requestId: "11111111-1111-4111-8111-111111111111",
    status: "review_draft",
    importId,
    draftId: "33333333-3333-4333-8333-333333333333",
    draftStatus: readyToConfirm ? "ready_to_confirm" : "review_required",
    reviewRevision,
    retentionExpiresAt: "2026-08-05T09:30:00.000Z",
    effectiveResume: effectiveResume(readyToConfirm),
    sections: sectionNames.map((section) => ({
      section,
      label: section === "summary" ? "Summary" : section,
      fields:
        section === "summary"
          ? [
              {
                fieldId,
                fieldPath: "summary",
                value: { kind: "text", value: "Synthetic summary" },
                sourceStatus: "explicit_source",
                confidenceStatus: "high",
                inferenceStatus: readyToConfirm
                  ? "confirmed_inference"
                  : "inferred_needs_review",
                reviewStatus: readyToConfirm ? "confirmed" : "unreviewed",
                provenance: readyToConfirm
                  ? { kind: "pdf", pageNumber: 2 }
                  : {
                      kind: "inferred",
                      needsConfirmation: true,
                      original: { kind: "pdf", pageNumber: 2 },
                    },
                warningIds: [warningId],
                allowedActions: ["confirm", "edit", "remove"],
              },
            ]
          : [],
      warnings:
        section === "summary"
          ? [
              {
                warningId,
                warningType: "ambiguous",
                section,
                fieldPath: "summary",
                message: "This synthetic information needs confirmation.",
                severity: "needs_attention",
                reviewStatus: readyToConfirm
                  ? "intentionally_left"
                  : "needs_review",
                requiresResolution: true,
                allowedActions: [
                  "confirm",
                  "edit",
                  "exclude",
                  "intentionally_leave",
                ],
              },
            ]
          : [],
      allowedActions: ["add", "exclude"],
    })),
    activeFieldCount: 1,
    unresolvedWarningCount: readyToConfirm ? 0 : 1,
    readyToConfirm,
    userMessage: "Review the imported information.",
  };
}

function effectiveResume(includeSummary: boolean) {
  return {
    personal: [],
    contact: [],
    ...(includeSummary
      ? {
          summary: {
            value: "Synthetic summary",
            sourceStatus: "explicit_source",
            confidenceStatus: "high",
            inferenceStatus: "confirmed_inference",
            provenance: { kind: "pdf", pageNumber: 2 },
          },
        }
      : {}),
    workExperiences: [],
    education: [],
    skills: [],
    languages: [],
    projects: [],
    certifications: [],
    professionalLinks: [],
  };
}

async function expectFocusedElementHasVisibleFocus(
  page: import("@playwright/test").Page,
) {
  const outline = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return "";
    return window.getComputedStyle(active).outlineStyle;
  });
  expect(outline).not.toBe("none");
}
