import { expect, test, type Page, type Route } from "@playwright/test";

const draftId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-07-29T09:30:00.000Z";
const initialUpdatedAt = "2026-07-29T09:30:00.000Z";
const savedUpdatedAt = "2026-07-29T09:31:00.000Z";

const blankContent = {
  personal: [],
  contact: [],
  workExperiences: [],
  education: [],
  skills: [],
  languages: [],
  projects: [],
  certifications: [],
  professionalLinks: [],
};

test.describe("manual resume route accessibility", () => {
  test("initializes the manual draft and renders an accessible editor", async ({
    page,
  }) => {
    await stubManualDraftApi(page);
    await page.goto("/resumes/new/manual");

    const loading = page.getByText("Preparing your resume draft.");
    await expect(loading).toBeVisible();
    await expect(page.locator("section").first()).toHaveAttribute(
      "aria-live",
      "polite",
    );

    await expect(
      page.getByRole("heading", { name: "Manual resume draft", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.locator(".save-status")).toHaveAttribute(
      "aria-live",
      "polite",
    );

    for (const name of [
      "Basics",
      "Work experience",
      "Education",
      "Skills",
      "Languages",
      "Projects",
      "Certifications",
      "Professional links",
    ]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }

    await expect(page.getByRole("heading", { name: "Basics" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Personal information" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Contact information" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Summary" })).toHaveCount(0);

    await expect(
      page.getByRole("textbox", { name: "Professional headline" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Summary", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Professional summary" }),
    ).toBeVisible();

    await expectAllVisibleFieldsHaveAccessibleNames(page);
    await expectAllVisibleButtonsHaveAccessibleNames(page);
    await expectNoSeriousBuiltInAccessibilityViolations(page);
  });

  test("supports keyboard add and remove actions with logical focus", async ({
    page,
  }) => {
    await stubManualDraftApi(page);
    await page.goto("/resumes/new/manual");
    const skillsSection = page.getByRole("button", {
      name: "Skills",
      exact: true,
    });
    await skillsSection.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();

    const addSkills = page.getByRole("button", { name: "Add skills" });
    await addSkills.focus();
    await expectFocusedElementHasVisibleFocus(page);
    await page.keyboard.press("Enter");

    const skillName = page.getByRole("textbox", { name: "Name" });
    await expect(skillName).toBeFocused();
    await expectFocusedElementHasVisibleFocus(page);
    await expect(page.getByText("Skill 1")).toBeVisible();
    await skillName.fill("Synthetic skill");

    const removeSkill = page.getByRole("button", { name: "Remove skills 1" });
    await expect(removeSkill).toBeVisible();
    await removeSkill.focus();
    await expectFocusedElementHasVisibleFocus(page);
    await page.keyboard.press("Space");

    await expect(addSkills).toBeFocused();
    await expectFocusedElementHasVisibleFocus(page);
  });

  test("keeps desktop editing and the canonical live preview visible together", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubManualDraftApi(page);
    await page.goto("/resumes/new/manual");

    const editPane = page.getByRole("tabpanel", { name: "Edit" });
    const previewPane = page.getByRole("tabpanel", {
      name: "Preview",
      exact: true,
    });
    await expect(editPane).toBeVisible();
    await expect(previewPane).toBeVisible();
    const editBox = await editPane.boundingBox();
    const previewBox = await previewPane.boundingBox();
    expect(editBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (editBox === null || previewBox === null) return;
    expect(previewBox.x).toBeGreaterThan(editBox.x + editBox.width);
    expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(1440);

    const headline = page.getByRole("textbox", {
      name: "Professional headline",
    });
    await headline.fill("Responsive systems engineer");
    await expect(previewPane).toContainText("Responsive systems engineer");

    await page.getByRole("button", { name: "Summary", exact: true }).click();
    await expect(headline).toHaveCount(0);
    await page.getByRole("button", { name: "Basics", exact: true }).click();
    await expect(headline).toHaveValue("Responsive systems engineer");
  });

  test("preserves unsaved content when switching mobile Edit and Preview modes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubManualDraftApi(page);
    await page.goto("/resumes/new/manual");

    const editPane = page.getByRole("tabpanel", { name: "Edit" });
    const previewPane = page.getByRole("tabpanel", {
      name: "Preview",
      exact: true,
    });
    await expect(editPane).toBeVisible();
    await expect(previewPane).toBeHidden();

    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill("Mobile context keeper");
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(editPane).toBeHidden();
    await expect(previewPane).toBeVisible();
    await expect(previewPane).toContainText("Mobile context keeper");

    await page.getByRole("tab", { name: "Edit" }).click();
    await expect(
      page.getByRole("textbox", { name: "Professional headline" }),
    ).toHaveValue("Mobile context keeper");
    await expect(page.locator(".save-status")).toContainText("Unsaved changes");
  });

  test("uses intentional Edit and Preview modes at tablet width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1024 });
    await stubManualDraftApi(page);
    await page.goto("/resumes/new/manual");

    const modeTabs = page.getByRole("tablist", { name: "Editor view" });
    const editPane = page.getByRole("tabpanel", { name: "Edit" });
    const previewPane = page.getByRole("tabpanel", {
      name: "Preview",
      exact: true,
    });
    await expect(modeTabs).toBeVisible();
    await expect(editPane).toBeVisible();
    await expect(previewPane).toBeHidden();
    await page.getByRole("tab", { name: "Edit" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Preview" })).toBeFocused();
    await expect(previewPane).toBeVisible();
    await expect(editPane).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeVisible();
  });

  test("reorders sections from the keyboard and persists the order on save", async ({
    page,
  }) => {
    let savedSectionOrder: readonly string[] | undefined;
    await stubManualDraftApi(page, {
      onPatch: async (route) => {
        const body = route.request().postDataJSON() as {
          readonly content: { readonly sectionOrder?: readonly string[] };
        };
        savedSectionOrder = body.content.sectionOrder;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(successfulDraftResponse(savedUpdatedAt)),
        });
      },
    });
    await page.goto("/resumes/new/manual");

    const moveSummaryUp = page.getByRole("button", {
      name: "Move Summary up",
    });
    await moveSummaryUp.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".import-status-live-region")).toContainText(
      "Summary moved to position 1.",
    );
    await expect(page.locator(".section-navigation-button").first()).toHaveText(
      "Summary",
    );

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect.poll(() => savedSectionOrder?.[0]).toBe("summary");
  });

  test("associates validation errors with fields and focuses the error summary", async ({
    page,
  }) => {
    await stubManualDraftApi(page);
    await page.goto("/resumes/new/manual");
    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill("x".repeat(4_001));
    await page.getByRole("button", { name: "Save draft" }).click();

    const summary = page.getByText("Fix the highlighted fields before saving.");
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(page.locator("#headline")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator("#headline")).toHaveAttribute(
      "aria-describedby",
      "headline-error",
    );
    await expect(page.locator("#headline-error")).toBeVisible();
    await expect(page.locator(".save-status")).toContainText("Error — retry");
  });

  test("announces saving, saved, failed, and stale-conflict states", async ({
    page,
  }) => {
    let patchCount = 0;
    await stubManualDraftApi(page, {
      onPatch: async (route) => {
        patchCount += 1;
        if (patchCount === 1) {
          await delayedFulfill(route, successfulDraftResponse(savedUpdatedAt));
          return;
        }
        if (patchCount === 2) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({}),
          });
          return;
        }
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      },
    });
    await page.goto("/resumes/new/manual");

    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill("Synthetic headline");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".save-status")).toContainText("Saving…");
    await expect(page.locator(".save-status")).toContainText("Saved");

    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill("Synthetic failed headline");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".save-status")).toContainText("Error — retry");

    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill("Synthetic stale headline");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".save-status")).toContainText(
      "Error — reload required",
    );
    await expect(
      page.getByRole("button", { name: "Reload draft" }),
    ).toBeVisible();
  });

  test("prevents duplicate save submission while a save is in progress", async ({
    page,
  }) => {
    let patchCount = 0;
    await stubManualDraftApi(page, {
      onPatch: async (route) => {
        patchCount += 1;
        await delayedFulfill(route, successfulDraftResponse(savedUpdatedAt));
      },
    });
    await page.goto("/resumes/new/manual");
    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill("Synthetic duplicate prevention");

    const save = page.getByRole("button", { name: "Save draft" });
    await save.dblclick();
    await expect(page.locator(".save-status")).toContainText("Saved");
    expect(patchCount).toBe(1);
  });

  test("exposes a failed save state without leaking form values", async ({
    page,
  }) => {
    await stubManualDraftApi(page, {
      onPatch: async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      },
    });
    await page.goto("/resumes/new/manual");
    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill("Synthetic private headline");
    await page.getByRole("button", { name: "Save draft" }).click();

    const error = page.getByText("Manual resume drafts are temporarily");
    await expect(error).toBeVisible();
    await expect(error).toBeFocused();
    await expect(error).not.toContainText("Synthetic private headline");
  });

  test("keeps the unsaved-change navigation warning reachable", async ({
    page,
  }) => {
    await stubManualDraftApi(page);
    await page.goto("/resumes/new/manual");
    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill("Synthetic unsaved headline");
    await expect(page.locator(".save-status")).toContainText("Unsaved changes");

    const dialogPromise = page.waitForEvent("dialog");
    await page.close({ runBeforeUnload: true });
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe("beforeunload");
  });
});

async function stubManualDraftApi(
  page: Page,
  options: {
    readonly onPatch?: ((route: Route) => Promise<void>) | undefined;
  } = {},
) {
  await page.route("**/manual-resume-drafts**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" || request.method() === "GET") {
      await delayedFulfill(route, successfulDraftResponse(initialUpdatedAt));
      return;
    }
    if (request.method() === "PATCH") {
      if (options.onPatch !== undefined) {
        await options.onPatch(route);
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successfulDraftResponse(savedUpdatedAt)),
      });
      return;
    }
    await route.fallback();
  });
}

function successfulDraftResponse(updatedAt: string) {
  return {
    version: "2026-07-28",
    requestId,
    status: "manual_draft",
    draft: {
      draftId,
      source: "manual_entry",
      status: "editing",
      content: blankContent,
      createdAt,
      updatedAt,
    },
    userMessage: "Your manual resume draft is ready.",
  };
}

async function delayedFulfill(route: Route, body: unknown) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function expectAllVisibleFieldsHaveAccessibleNames(page: Page) {
  const fields = page.locator("input:visible, textarea:visible");
  for (let index = 0; index < (await fields.count()); index += 1) {
    await expect(fields.nth(index)).not.toHaveAccessibleName("");
  }
}

async function expectAllVisibleButtonsHaveAccessibleNames(page: Page) {
  const buttons = page.locator("button:visible");
  for (let index = 0; index < (await buttons.count()); index += 1) {
    await expect(buttons.nth(index)).not.toHaveAccessibleName("");
  }
}

async function expectNoSeriousBuiltInAccessibilityViolations(page: Page) {
  await expect(page.locator("[aria-invalid='true']")).toHaveCount(0);
  await expect(page.locator("input:visible:not([id])")).toHaveCount(0);
  await expect(page.locator("textarea:visible:not([id])")).toHaveCount(0);
  await expectAllVisibleFieldsHaveAccessibleNames(page);
  await expectAllVisibleButtonsHaveAccessibleNames(page);
}

async function expectFocusedElementHasVisibleFocus(page: Page) {
  await expect
    .poll(async () =>
      page.locator(":focus").evaluate((element) => {
        const style = window.getComputedStyle(element);
        return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
      }),
    )
    .toBe(true);
}
