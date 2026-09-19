import type { Page } from "@playwright/test";
import { expect, test } from "../csp-fixture";
import { PdfJsPdfAdapter } from "../../../packages/extraction/src/pdf/pdfjs-pdf-adapter";

const runsAgainstLocalStack = process.env.LOCAL_PLAY_BASE_URL !== undefined;

test.skip(
  !runsAgainstLocalStack,
  "The full journey runs only in the deterministic local-stack acceptance phase.",
);

test.describe.configure({ mode: "serial" });

const journeys = [
  {
    format: "PDF",
    fixture:
      "/workspace/tests/fixtures/resumes/semantic-vertical-slice-jordan-avery.pdf",
    retainedValues: [
      "Jordan Avery",
      "jordan.avery@example.test",
      "Nova Systems",
      "State University",
      "TypeScript",
      "English",
    ],
    pdfReadingOrder: [
      "Reviewed PDF import",
      "Jordan Avery",
      "SKILLS",
      "TypeScript",
      "PROFESSIONAL SUMMARY",
      "EXPERIENCE",
      "Nova Systems",
      "EDUCATION",
      "State University",
      "LANGUAGES",
      "English",
    ],
  },
  {
    format: "DOCX",
    fixture:
      "/workspace/tests/fixtures/resumes/semantic-vertical-slice-maya-chen.docx",
    retainedValues: [
      "Maya Chen",
      "maya.chen@example.test",
      "Acme Studio",
      "Bright Labs",
      "Figma",
      "Open-source design tokens library",
      "French",
    ],
    pdfReadingOrder: [
      "Reviewed DOCX import",
      "Maya Chen",
      "SKILLS",
      "Figma",
      "PROFESSIONAL SUMMARY",
      "EXPERIENCE",
      "Acme Studio",
      "Bright Labs",
      "PROJECTS",
      "Open-source design tokens library",
      "LANGUAGES",
      "French",
    ],
  },
] as const;

for (const journey of journeys) {
  test(`${journey.format} import survives confirmation, editing, preview, PDF, and reopen`, async ({
    page,
  }) => {
    const networkOrigins = new Set<string>();
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol === "http:" || url.protocol === "https:") {
        networkOrigins.add(url.origin);
      }
    });

    await uploadDocument(page, journey.fixture);
    await expect(
      page.getByRole("heading", {
        name: "Check the information Nuvitae needs you to confirm",
      }),
    ).toBeVisible({ timeout: 90_000 });
    await expandReviewSections(page);

    for (const value of journey.retainedValues) {
      await expect(
        page.getByRole("main").getByText(value).first(),
      ).toBeVisible();
    }

    await confirmAllWarnings(page);
    await reviewOneImportedField(page);
    await page.getByRole("button", { name: "Create my resume" }).click();
    await page.getByRole("link", { name: "Open my resume" }).click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+$/i);
    await expect(
      page.getByRole("heading", { name: "Edit your resume" }),
    ).toBeVisible();

    await page
      .getByRole("textbox", { name: "Professional headline" })
      .fill(`Reviewed ${journey.format} import`);
    for (let move = 0; move < 4; move += 1) {
      await page.getByRole("button", { name: "Move Skills up" }).click();
    }
    await page.getByRole("button", { name: "Save resume" }).click();
    await expect(page.locator(".save-status")).toHaveText("Saved");

    const preview = previewResume(page);
    for (const value of journey.retainedValues) {
      await expect(preview).toContainText(value);
    }
    const savedPreviewText = normalizeResumeText(await preview.innerText());
    assertMaterialOrder(savedPreviewText, journey.pdfReadingOrder);

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Edit your resume" }),
    ).toBeVisible();
    expect(normalizeResumeText(await previewResume(page).innerText())).toBe(
      savedPreviewText,
    );

    await page.getByRole("link", { name: "Export PDF" }).click();
    await expect(
      page.getByRole("heading", { name: "Your PDF is ready to save" }),
    ).toBeVisible();
    const exportResume = page.locator('[data-resume-template="professional"]');
    expect(normalizeResumeText(await exportResume.innerText())).toBe(
      savedPreviewText,
    );

    const extraction = await extractText(
      await page.pdf({
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
      }),
    );
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) return;
    expect(extraction.value.length).toBeGreaterThanOrEqual(1);
    expect(extraction.value.length).toBeLessThanOrEqual(2);
    expect(extraction.value.some((pdfPage) => pdfPage.items.length > 0)).toBe(
      true,
    );
    const extractedText = extraction.value
      .flatMap((pdfPage) => pdfPage.items.map((item) => item.text))
      .join(" ");
    assertMaterialOrder(extractedText, journey.pdfReadingOrder);

    await page.getByRole("link", { name: "Back to resume" }).click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+$/i);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Edit your resume" }),
    ).toBeVisible();
    expect(normalizeResumeText(await previewResume(page).innerText())).toBe(
      savedPreviewText,
    );

    expect([...networkOrigins]).toEqual([new URL(page.url()).origin]);
  });
}

async function uploadDocument(page: Page, filePath: string): Promise<void> {
  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/import-resume$/.test(response.url()),
  );
  await page.getByRole("button", { name: "Upload and start import" }).click();
  expect((await uploadResponse).status()).toBe(201);
  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
}

async function reviewOneImportedField(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Edit field" }).first().click();
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByRole("status").first()).not.toContainText(
    "Saving review change.",
  );
}

async function confirmAllWarnings(page: Page): Promise<void> {
  const confirmations = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  while ((await confirmations.count()) > 0) {
    await confirmations.first().click();
    await expect(page.getByRole("status").first()).not.toContainText(
      "Saving review change.",
    );
  }
}

async function expandReviewSections(page: Page): Promise<void> {
  const closedSections = page.locator(
    "details.review-section:not([open]) > summary",
  );
  while ((await closedSections.count()) > 0) {
    await closedSections.first().click();
  }
}

function previewResume(page: Page) {
  return page
    .locator('[data-preview-surface="professional-resume"]')
    .locator('[data-resume-template="professional"]');
}

async function extractText(bytes: Buffer) {
  const adapter = new PdfJsPdfAdapter(
    { readSource: async () => new Uint8Array(bytes) },
    { maximumFileSizeBytes: 5_000_000, maximumPageCount: 10 },
  );
  return adapter.extractSelectableText({
    importId: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    sourceStorageKey: "in-memory-fidelity-export",
    format: "pdf",
  });
}

function normalizeResumeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function assertMaterialOrder(
  text: string,
  expectedValues: readonly string[],
): void {
  const comparableText = text.toLocaleLowerCase("en");
  expectedValues.reduce((previousIndex, value) => {
    const index = comparableText.indexOf(value.toLocaleLowerCase("en"));
    expect(
      index,
      `${value} should remain extractable in order`,
    ).toBeGreaterThan(previousIndex);
    return index;
  }, -1);
}
