import { expect, test } from "@playwright/test";
import { PdfJsPdfAdapter } from "../../../packages/extraction/src/pdf/pdfjs-pdf-adapter";

const resumeId = "44444444-4444-4444-8444-444444444444";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/community-auth/session/status", async (route) => {
    await route.fulfill({ status: 401, json: {} });
  });
});

test("canonical resume export produces selectable text in material reading order", async ({
  page,
}) => {
  await page.route(`**/api/structured-resumes/${resumeId}`, async (route) => {
    await route.fulfill({ status: 200, json: confirmedResumeResponse() });
  });

  await page.goto(`/resumes/${resumeId}`);
  await expect(
    page.getByRole("heading", { name: "Your resume is ready" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Export PDF" }).click();
  await expect(page).toHaveURL(`/resumes/${resumeId}/export`);
  await expect(
    page.getByRole("heading", { name: "Your PDF is ready to save" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-resume-template="professional"]'),
  ).toContainText("Jordan Avery");

  const bytes = await page.pdf({
    format: "A4",
    preferCSSPageSize: true,
    printBackground: true,
  });
  const extraction = await extractText(bytes);

  expect(extraction.ok).toBe(true);
  if (!extraction.ok) return;
  const text = extraction.value
    .flatMap((pdfPage) => pdfPage.items.map((item) => item.text))
    .join(" ");
  const expectedOrder = [
    "Jordan Avery",
    "Software Engineer",
    "PROFESSIONAL SUMMARY",
    "Builds reliable products.",
    "EXPERIENCE",
    "Nova Systems",
    "Senior Engineer",
    "Led platform delivery",
    "SKILLS",
    "TypeScript",
  ];
  expectedOrder.reduce((previousIndex, value) => {
    const index = text.indexOf(value);
    expect(index, `${value} should remain extractable`).toBeGreaterThan(
      previousIndex,
    );
    return index;
  }, -1);
  expect(text).not.toContain("Your PDF is ready to save");
});

test("failed owner-scoped read stays recoverable and does not expose diagnostics", async ({
  page,
}) => {
  await page.route(`**/api/structured-resumes/${resumeId}`, async (route) => {
    await route.fulfill({
      status: 503,
      json: {
        userMessage: "database diagnostics containing private resume text",
      },
    });
  });

  await page.goto(`/resumes/${resumeId}/export`);

  await expect(
    page.getByRole("heading", { name: "PDF export unavailable" }),
  ).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toHaveText(
    "Resume creation is temporarily unavailable.",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("database diagnostics")).toHaveCount(0);
  await expect(page.getByText("Jordan Avery")).toHaveCount(0);
});

async function extractText(bytes: Buffer) {
  const adapter = new PdfJsPdfAdapter(
    {
      readSource: async () => new Uint8Array(bytes),
    },
    { maximumFileSizeBytes: 5_000_000, maximumPageCount: 10 },
  );
  return adapter.extractSelectableText({
    importId: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    sourceStorageKey: "in-memory-export",
    format: "pdf",
  });
}

function confirmedResumeResponse() {
  const sourced = (value: string) => ({
    value,
    sourceStatus: "explicit_source",
    confidenceStatus: "high",
    inferenceStatus: "not_inferred",
    provenance: { kind: "pdf", pageNumber: 1 },
  });
  return {
    version: "2026-07-28",
    requestId: "11111111-1111-4111-8111-111111111111",
    status: "confirmed_structured_resume",
    structuredResumeId: resumeId,
    confirmationStatus: "confirmed",
    provenanceLabel: "imported_from_initial_resume",
    content: {
      personal: [sourced("Jordan Avery")],
      contact: [sourced("jordan@example.test")],
      headline: sourced("Software Engineer"),
      summary: sourced("Builds reliable products."),
      workExperiences: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          employerName: "Nova Systems",
          roles: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              title: "Senior Engineer",
              isOngoing: true,
              responsibilities: [sourced("Led platform delivery")],
              achievements: [],
            },
          ],
        },
      ],
      education: [],
      skills: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          name: sourced("TypeScript"),
        },
      ],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    createdAt: "2026-08-22T09:00:00.000Z",
    updatedAt: "2026-08-22T09:00:00.000Z",
    sourceAvailability: "source_no_longer_available",
    userMessage: "Loaded.",
  };
}
