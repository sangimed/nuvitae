import { expect, test, type Page } from "@playwright/test";
import { readImportInvariants } from "./test-support/vertical-slice-persistence";

/**
 * T211 semantic-import vertical slice through the real browser and the real
 * local Docker stack.
 *
 * The no-provider scenario must run against the production-style worker
 * composition (NUVITAE_SEMANTIC_PROVIDER_MODE unset/defaults to production).
 * The PDF and DOCX scenarios must run against the explicit local/E2E worker
 * composition (NUVITAE_SEMANTIC_PROVIDER_MODE=deterministic-e2e-test). The
 * local acceptance script starts the worker in production mode, runs the
 * no-provider scenario, then recreates the worker with the explicit E2E mode
 * and runs the PDF and DOCX scenarios.
 */

test.describe.configure({ mode: "serial" });

const pdfFixture =
  "/workspace/tests/fixtures/resumes/semantic-vertical-slice-jordan-avery.pdf";
const docxFixture =
  "/workspace/tests/fixtures/resumes/semantic-vertical-slice-maya-chen.docx";

const technicalDiagnosticPattern =
  /LibreOffice|PdfJs|Ooxml|parser-input|parser-output|storageKey|storage key|users\/|imports\/|provider|deterministic|transcript|fragment hash|schemaVersion|\.xml|\.docx|\.pdf/i;

test("no production semantic provider is configured fails closed with privacy-safe recovery", async ({
  page,
}) => {
  const importId = await uploadDocument(page, pdfFixture);

  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "This resume could not be prepared" }),
  ).toBeVisible({ timeout: 90_000 });

  // Only already-supported recovery paths are offered.
  await expect(
    page.getByRole("button", { name: "Upload a different file" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enter manually" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review imported resume" }),
  ).toHaveCount(0);

  // The browser receives only privacy-safe, non-technical recovery behavior.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(technicalDiagnosticPattern);
  for (const sensitive of [
    "Jordan Avery",
    "jordan.avery@example.test",
    "Maya Chen",
    "maya.chen@example.test",
  ]) {
    expect(body).not.toContain(sensitive);
  }

  // Provider absence persists the provider-neutral unavailable failure, creates
  // no draft, and creates no structured resume.
  const invariants = await readImportInvariants(importId);
  expect(invariants.processingStatus).toBe("provider_unavailable");
  expect(invariants.draftCount).toBe(0);
  expect(invariants.structuredResumeCount).toBe(0);
});

test("real selectable-text PDF vertical slice reaches review, confirmation, and a persisted structured resume", async ({
  page,
}) => {
  const importId = await uploadDocument(page, pdfFixture);

  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review imported resume" }),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Review imported resume" }).click();
  await expect(page).toHaveURL(/\/import-resume\/[0-9a-f-]+\/review/);
  await expect(
    page.getByRole("heading", { name: "Review imported resume" }),
  ).toBeVisible();

  // Small stable sentinel set of grounded fields from the T210 PDF profile.
  await expect(page.getByText("Jordan Avery")).toBeVisible();
  await expect(page.getByText("jordan.avery@example.test")).toBeVisible();
  await expect(page.getByText("Nova Systems").first()).toBeVisible();
  await expect(
    page.getByText("Senior Software Engineer").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Imported from initial resume").first(),
  ).toBeVisible();

  // The T210 PDF profile carries no ambiguity or inference diagnostics, so the
  // review must show zero review-required warnings and confirmation must be
  // reachable once a field is confirmed.
  await expect(
    page.locator(".status-list div", { hasText: "Needs review" }).last(),
  ).toContainText("0");
  await expect(
    page.getByRole("button", { name: "Create my resume" }),
  ).toHaveCount(0);

  await confirmAllUnreviewedFields(page);
  await expect(
    page.getByRole("button", { name: "Create my resume" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create my resume" }).click();
  await expect(
    page.getByRole("dialog", { name: "Create your resume" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+/);

  // Exactly one import draft and exactly one structured resume for the source.
  const invariants = await readImportInvariants(importId);
  expect(invariants.draftCount).toBe(1);
  expect(invariants.structuredResumeCount).toBe(1);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your resume is ready" }),
  ).toBeVisible();
  await expect(page.getByText("Jordan Avery")).toBeVisible();
  await expect(
    page.getByText("Created from your reviewed initial resume").first(),
  ).toBeVisible();

  // The confirmed resume is distinct from the uploaded source and no internal
  // diagnostics, storage paths, or fixture identity leak into the browser.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(technicalDiagnosticPattern);
  expect(body).not.toContain("Structured resume");
  expect(body).not.toContain("semantic-vertical-slice-jordan-avery.pdf");
});

test("real DOCX vertical slice proves OOXML extraction and review-required ambiguity handling", async ({
  page,
}) => {
  const importId = await uploadDocument(page, docxFixture);

  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review imported resume" }),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Review imported resume" }).click();
  await expect(page).toHaveURL(/\/import-resume\/[0-9a-f-]+\/review/);
  await expect(
    page.getByRole("heading", { name: "Review imported resume" }),
  ).toBeVisible();

  // Small stable sentinel set of grounded fields from the T210 DOCX profile.
  await expect(page.getByText("Maya Chen")).toBeVisible();
  await expect(page.getByText("maya.chen@example.test")).toBeVisible();
  await expect(page.getByText("Acme Studio")).toBeVisible();
  await expect(page.getByText("Bright Labs")).toBeVisible();

  // The T210 DOCX profile carries one ambiguity diagnostic that must be
  // visibly review-required and block confirmation.
  await expect(
    page.getByText("The end date could be read as a range or a single year."),
  ).toBeVisible();
  await expect(
    page.locator(".status-list div", { hasText: "Needs review" }).last(),
  ).toContainText("1");
  await expect(
    page.getByRole("heading", { name: "Review remaining details" }),
  ).toBeVisible();

  await resolveAllVisibleWarnings(page);
  await confirmAllUnreviewedFields(page);
  await expect(
    page.getByRole("button", { name: "Create my resume" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create my resume" }).click();
  await page.getByRole("button", { name: "Create resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+/);

  const invariants = await readImportInvariants(importId);
  expect(invariants.draftCount).toBe(1);
  expect(invariants.structuredResumeCount).toBe(1);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your resume is ready" }),
  ).toBeVisible();
  await expect(page.getByText("Maya Chen")).toBeVisible();

  // No LibreOffice, XML-path, paragraph/run, storage, or provider-native
  // diagnostics are exposed to the browser.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(technicalDiagnosticPattern);
  expect(body).not.toContain("semantic-vertical-slice-maya-chen.docx");
});

async function uploadDocument(page: Page, filePath: string): Promise<string> {
  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/import-resume$/.test(response.url()),
  );
  await page.getByRole("button", { name: "Upload and start import" }).click();
  const response = await uploadResponse;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { readonly importId: string };
  expect(body.importId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  return body.importId;
}

async function confirmAllUnreviewedFields(page: Page): Promise<void> {
  const unreviewed = page.locator("article.review-field").filter({
    hasText: "Review state: unreviewed",
  });
  while ((await unreviewed.count()) > 0) {
    await unreviewed
      .first()
      .getByRole("button", { name: "Confirm field" })
      .click();
    await expect(page.getByRole("status").first()).not.toContainText(
      "Saving review change.",
    );
  }
}

async function resolveAllVisibleWarnings(page: Page): Promise<void> {
  const unresolved = page.locator("article.review-warning").filter({
    hasText: "Review state: needs review",
  });
  while ((await unresolved.count()) > 0) {
    await unresolved
      .first()
      .getByRole("button", { name: "Intentionally leave" })
      .click();
    await expect(page.getByRole("status").first()).not.toContainText(
      "Saving review change.",
    );
  }
}
