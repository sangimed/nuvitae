import { expect, test } from "@playwright/test";

const importId = "22222222-2222-4222-8222-222222222222";
const base = {
  version: "2026-07-28",
  requestId: "11111111-1111-4111-8111-111111111111",
  importId,
};

test.describe("import resume upload and progress accessibility", () => {
  test("exposes accessible choices, upload guidance, and duplicate-submit prevention", async ({
    page,
  }) => {
    let uploadCount = 0;

    await page.route("**/import-resume", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      uploadCount += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ...base,
          status: "import_initialization",
          uploadStatus: "uploaded",
          retentionExpiresAt: "2026-08-05T09:30:00.000Z",
          manualEntryUrl: "/resumes/new/manual",
          userMessage: "Your resume was uploaded privately.",
        }),
      });
    });

    await page.route(`**/import-resume/${importId}/status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...base,
          status: "draft_ready",
          progressKnown: true,
          progressPercent: 100,
          draftSummary: {
            draftId: "33333333-3333-4333-8333-333333333333",
            retentionExpiresAt: "2026-08-05T09:30:00.000Z",
            fieldCount: 6,
            warningCount: 0,
          },
          allowedRecoveryActions: ["manual_entry"],
          userMessage:
            "Your imported resume draft is ready. Review will be available in a later step.",
        }),
      });
    });

    await page.goto("/import-resume");

    await expect(
      page.getByRole("button", { name: "Import my resume" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Enter manually" }),
    ).toBeVisible();
    await expect(page.getByText("Recommended path")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Import my resume" }),
    ).toBeFocused();
    await expectFocusedElementHasVisibleFocus(page);
    await page.keyboard.press("Enter");

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();
    await expect(page.getByText("PDF and DOCX files only.")).toBeVisible();
    await expect(
      page.getByText("Uploaded sources and source-reconstructing artifacts"),
    ).toBeVisible();
    await expect(
      fileInput,
      "supported-file and privacy guidance are associated with the input",
    ).toHaveAttribute("aria-describedby", /.+/);

    await fileInput.setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF synthetic selectable text"),
    });

    const submit = page.getByRole("button", {
      name: "Upload and start import",
    });
    await submit.focus();
    await expectFocusedElementHasVisibleFocus(page);
    await submit.click();
    expect(uploadCount).toBe(1);
  });

  test("announces draft-ready terminal state without inventing review UI", async ({
    page,
  }) => {
    await page.route("**/import-resume", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ...base,
          status: "import_initialization",
          uploadStatus: "uploaded",
          retentionExpiresAt: "2026-08-05T09:30:00.000Z",
          manualEntryUrl: "/resumes/new/manual",
          userMessage: "Your resume was uploaded privately.",
        }),
      });
    });
    await page.route(`**/import-resume/${importId}/status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...base,
          status: "draft_ready",
          progressKnown: true,
          progressPercent: 100,
          draftSummary: {
            draftId: "33333333-3333-4333-8333-333333333333",
            retentionExpiresAt: "2026-08-05T09:30:00.000Z",
            fieldCount: 6,
            warningCount: 0,
          },
          allowedRecoveryActions: ["manual_entry"],
          userMessage:
            "Your imported resume draft is ready. Review will be available in a later step.",
        }),
      });
    });

    await page.goto("/import-resume");
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF synthetic selectable text"),
    });
    await page.getByRole("button", { name: "Upload and start import" }).click();

    await expect(
      page.getByRole("heading", { name: "Your resume draft is ready" }),
    ).toBeVisible();
    await expect(page.getByText("42% complete")).toHaveCount(0);
    await expect(
      page.getByText("Your imported resume draft is ready"),
    ).toBeVisible();
    await expect(
      page.getByText("Review is not available in this slice yet."),
    ).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("moves validation error focus to a useful message", async ({ page }) => {
    await page.goto("/import-resume");
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.getByRole("button", { name: "Upload and start import" }).click();
    const error = page.getByText("Choose a resume file before");
    await expect(error).toBeVisible();
    await expect(error).toBeFocused();
  });

  test("preserves recovery actions on upload failure and supports manual navigation", async ({
    page,
  }) => {
    await page.route("**/import-resume", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: 503, body: "" });
    });
    await page.goto("/import-resume");
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "resume.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("synthetic docx"),
    });
    await page.getByRole("button", { name: "Upload and start import" }).click();
    await expect(page.getByText("temporarily unavailable")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload and start import" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("link", { name: "Enter manually" }).click();
    await expect(page).toHaveURL(/\/resumes\/new\/manual$/);
  });

  test("timeout state exposes only supported manual-entry and replacement actions", async ({
    page,
  }) => {
    await page.route("**/import-resume", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ...base,
          status: "import_initialization",
          uploadStatus: "uploaded",
          retentionExpiresAt: "2026-08-05T09:30:00.000Z",
          manualEntryUrl: "/resumes/new/manual",
          userMessage: "Your resume was uploaded privately.",
        }),
      });
    });
    await page.route(`**/import-resume/${importId}/status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...base,
          status: "recoverable_timeout",
          progressKnown: false,
          failure: {
            code: "processing_timeout",
            userMessage: "Reading this resume took longer than expected.",
            retryable: true,
            recoveryActions: ["replace_upload", "manual_entry"],
          },
          allowedRecoveryActions: ["replace_upload", "manual_entry"],
          userMessage: "Reading this resume took longer than expected.",
        }),
      });
    });

    await page.goto("/import-resume");
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF synthetic selectable text"),
    });
    await page.getByRole("button", { name: "Upload and start import" }).click();

    await expect(
      page.getByRole("heading", {
        name: "This is taking longer than expected",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload a different file" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enter manually" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /cancel/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Upload a different file" }).click();
    await expect(page.getByText("No file selected.")).toBeVisible();
  });
});

async function expectFocusedElementHasVisibleFocus(page: {
  locator: (selector: string) => {
    evaluate: <T>(callback: (element: Element) => T) => Promise<T>;
  };
}) {
  await expect
    .poll(async () =>
      page.locator(":focus").evaluate((element) => {
        const style = window.getComputedStyle(element);
        return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
      }),
    )
    .toBe(true);
}
