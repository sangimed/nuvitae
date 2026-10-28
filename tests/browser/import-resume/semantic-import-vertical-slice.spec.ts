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
const noSupportedFieldFixture =
  "/workspace/packages/test-fixtures/resume-import/pdf/no-supported-field.pdf";

const technicalDiagnosticPattern =
  /LibreOffice|PdfJs|Ooxml|parser-input|parser-output|storageKey|storage key|users\/|imports\/|provider|deterministic|transcript|fragment hash|schemaVersion|\.xml|\.docx|\.pdf/i;
const reviewTechnicalDiagnosticPattern =
  /LibreOffice|PdfJs|Ooxml|parser-input|parser-output|storageKey|storage key|users\/|imports\/|transcript|fragment hash|schemaVersion|\.xml|\.docx|\.pdf/i;

test("no production semantic provider is configured recovers the existing fallback draft after refresh", async ({
  page,
}) => {
  const importStarts = trackImportStarts(page);
  const importId = await uploadDocument(page, pdfFixture);

  await expect(page).toHaveURL(`/import-resume/${importId}`);
  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Check the information Nuvitae needs you to confirm",
    }),
  ).toBeVisible({ timeout: 90_000 });
  await page.reload();
  await expect(page).toHaveURL(`/import-resume/${importId}/review`);
  await page.reload();
  await expect(page).toHaveURL(`/import-resume/${importId}/review`);
  expect(importStarts()).toBe(1);

  // The review remains free of internal technical diagnostics.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(reviewTechnicalDiagnosticPattern);

  const acceptSuggestions = page.getByRole("button", {
    name: /Accept all \d+ suggested details/,
  });
  await expect(acceptSuggestions).toBeVisible();
  await acceptSuggestions.click();
  await expect(acceptSuggestions).toHaveCount(0);
  await page.reload();
  await expect(acceptSuggestions).toHaveCount(0);

  // The bounded fallback creates one review draft after one semantic attempt;
  // refreshing never creates another attempt or structured resume.
  const invariants = await readImportInvariants(importId);
  expect(invariants.processingStatus).toBe("ready_for_review");
  expect(invariants.draftCount).toBe(1);
  expect(invariants.structuredResumeCount).toBe(0);
});

test("real unsupported resume failure is recoverable after refresh", async ({
  page,
}) => {
  const importStarts = trackImportStarts(page);
  const importId = await uploadDocument(page, noSupportedFieldFixture);

  await expect(page).toHaveURL(`/import-resume/${importId}`);
  await expect(
    page.getByRole("heading", { name: "This file cannot be imported" }),
  ).toBeVisible({ timeout: 90_000 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "This file cannot be imported" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "This file cannot be imported" }),
  ).toBeVisible();
  expect(importStarts()).toBe(1);

  await expect(
    page.getByRole("button", { name: "Upload a different file" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enter manually" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review imported resume" }),
  ).toHaveCount(0);

  const invariants = await readImportInvariants(importId);
  expect(invariants.processingStatus).toBe("failed");
  expect(invariants.draftCount).toBe(0);
  expect(invariants.structuredResumeCount).toBe(0);
});

test("real selectable-text PDF vertical slice reaches review, confirmation, and a persisted structured resume", async ({
  page,
}) => {
  const importStarts = trackImportStarts(page);
  const importId = await uploadDocument(page, pdfFixture);

  await expect(page).toHaveURL(`/import-resume/${importId}`);
  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Check the information Nuvitae needs you to confirm",
    }),
  ).toBeVisible({ timeout: 90_000 });
  await page.reload();
  await expect(page).toHaveURL(`/import-resume/${importId}/review`);
  await page.reload();
  await expect(page).toHaveURL(`/import-resume/${importId}/review`);
  expect(importStarts()).toBe(1);
  await expect(
    page.getByRole("heading", {
      name: "Check the information Nuvitae needs you to confirm",
    }),
  ).toBeVisible();
  await expandReviewSections(page);

  // Small stable sentinel set of grounded fields from the T210 PDF profile.
  await expect(page.getByText("Jordan Avery")).toBeVisible();
  await expect(page.getByText("jordan.avery@example.test")).toBeVisible();
  await expect(page.getByText("Nova Systems").first()).toBeVisible();
  await expect(
    page.getByText("Senior Software Engineer").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Imported from your resume.", { exact: true }).first(),
  ).toBeVisible();

  // The T210 PDF profile carries no ambiguity or inference diagnostics, so the
  // review must show zero review-required warnings and confirmation must be
  // reachable once a field is confirmed.
  await expect(
    page.getByText("0 details still need your attention.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create my resume" }),
  ).toHaveCount(0);

  await reviewOneImportedField(page);
  await expect(
    page.getByRole("button", { name: "Create my resume" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create my resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+/);

  // Exactly one import draft and exactly one structured resume for the source.
  const invariants = await readImportInvariants(importId);
  expect(invariants.draftCount).toBe(1);
  expect(invariants.structuredResumeCount).toBe(1);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Edit your resume" }),
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
    page.getByRole("heading", {
      name: "Check the information Nuvitae needs you to confirm",
    }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole("heading", {
      name: "Check the information Nuvitae needs you to confirm",
    }),
  ).toBeVisible();
  await expandReviewSections(page);

  // Small stable sentinel set of grounded fields from the T210 DOCX profile.
  await expect(page.getByText("Maya Chen")).toBeVisible();
  await expect(page.getByText("maya.chen@example.test")).toBeVisible();
  await expect(page.getByText("Acme Studio").first()).toBeVisible();
  await expect(page.getByText("Bright Labs").first()).toBeVisible();

  // The diagnostic survives persistence and the owner-scoped API; the UI uses
  // localized type-based copy instead of rendering provider-authored prose.
  const response = await page.request.get(
    `/api/import-resume/${importId}/review`,
  );
  expect(response.ok()).toBe(true);
  const draft = reviewDraftReadResponseSchema.parse(await response.json());
  const warnings = draft.sections.flatMap((section) => section.warnings);
  expect(warnings).toHaveLength(1);
  const warning = warnings[0]!;
  expect(warning).toMatchObject({
    warningType: "ambiguous",
    message: "The end date could be read as a range or a single year.",
    reviewStatus: "needs_review",
    requiresResolution: true,
  });
  expect(draft.unresolvedWarningCount).toBe(1);
  expect(draft.readyToConfirm).toBe(false);
  const beforeConfirmation = await readImportInvariants(importId);
  expect(beforeConfirmation.processingStatus).toBe("ready_for_review");
  expect(beforeConfirmation.draftCount).toBe(1);
  expect(beforeConfirmation.structuredResumeCount).toBe(0);
  expect(beforeConfirmation.warnings).toEqual([
    {
      warningId: warning.warningId,
      warningType: "ambiguous",
      reviewStatus: "needs_review",
      requiresResolution: true,
    },
  ]);
  await expect(
    page.getByRole("heading", {
      name: "Please choose how to use this information",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This information may have more than one meaning. Review it and choose what belongs in your resume.",
    ),
  ).toBeVisible();
  await expect(page.getByText(warning.message, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("1 detail still needs your attention.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review remaining details" }),
  ).toBeVisible();

  await reviewOneImportedField(page);
  await expect(
    page.getByRole("button", { name: "Create my resume" }),
  ).toHaveCount(0);
  expect((await readImportInvariants(importId)).structuredResumeCount).toBe(0);
  expect(await page.locator("body").innerText()).not.toMatch(
    technicalDiagnosticPattern,
  );
  await confirmAllWarnings(page);
  await expect(
    page.getByRole("button", { name: "Create my resume" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create my resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+/);

  const invariants = await readImportInvariants(importId);
  expect(invariants.draftCount).toBe(1);
  expect(invariants.structuredResumeCount).toBe(1);
  expect(invariants.warnings).toEqual([
    { ...beforeConfirmation.warnings[0], reviewStatus: "confirmed" },
  ]);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Edit your resume" }),
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

function trackImportStarts(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/import-resume$/.test(request.url())
    ) {
      count += 1;
    }
  });
  return () => count;
}

async function expandReviewSections(page: Page): Promise<void> {
  const closedSections = page.locator(
    "details.review-section:not([open]) > summary",
  );
  while ((await closedSections.count()) > 0) {
    await closedSections.first().click();
  }
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
    const remaining = await confirmations.count();
    await confirmations.first().click();
    await expect(confirmations).toHaveCount(remaining - 1);
  }
}
