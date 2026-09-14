import { expect, test } from "../csp-fixture";
import { PdfJsPdfAdapter } from "../../../packages/extraction/src/pdf/pdfjs-pdf-adapter";

const resumeId = "44444444-4444-4444-8444-444444444444";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/community-auth/session/status", async (route) => {
    await route.fulfill({ status: 401, json: {} });
  });
});

test("saved preview and PDF share all supported content in persisted section order", async ({
  page,
}) => {
  await page.route(`**/api/structured-resumes/${resumeId}`, async (route) => {
    await route.fulfill({ status: 200, json: confirmedResumeResponse() });
  });

  await page.goto(`/resumes/${resumeId}`);
  await expect(
    page.getByRole("heading", { name: "Edit your resume" }),
  ).toBeVisible();

  const preview = page
    .locator('[data-preview-surface="professional-resume"]')
    .locator('[data-resume-template="professional"]');
  await expect(preview).toContainText("Jordan Avery");
  const previewRawText = await preview.innerText();
  const previewText = normalizeResumeText(previewRawText);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Edit your resume" }),
  ).toBeVisible();
  const reopenedPreview = page
    .locator('[data-preview-surface="professional-resume"]')
    .locator('[data-resume-template="professional"]');
  await expect(reopenedPreview).toContainText("Jordan Avery");
  expect(normalizeResumeText(await reopenedPreview.innerText())).toBe(
    normalizeResumeText(previewRawText),
  );

  await page.getByRole("link", { name: "Export PDF" }).click();
  await expect(page).toHaveURL(`/resumes/${resumeId}/export`);
  await expect(
    page.getByRole("heading", { name: "Your PDF is ready to save" }),
  ).toBeVisible();
  const exportedResume = page.locator('[data-resume-template="professional"]');
  await expect(exportedResume).toContainText("Jordan Avery");
  expect(normalizeResumeText(await exportedResume.innerText())).toBe(
    previewText,
  );

  const bytes = await page.pdf({
    format: "A4",
    preferCSSPageSize: true,
    printBackground: true,
  });
  const extraction = await extractText(bytes);

  expect(extraction.ok).toBe(true);
  if (!extraction.ok) return;
  expect(extraction.value).toHaveLength(1);
  expect(extraction.value[0]?.items.length).toBeGreaterThan(0);
  const text = extraction.value
    .flatMap((pdfPage) => pdfPage.items.map((item) => item.text))
    .join(" ");
  const expectedOrder = [
    "Jordan Avery",
    "Principal Platform Engineer",
    "jordan.avery@example.test",
    "Portfolio",
    "SKILLS",
    "TypeScript",
    "PROFESSIONAL SUMMARY",
    "Builds reliable, accessible products across international teams.",
    "EXPERIENCE",
    "Nova Systems",
    "Senior Engineer",
    "Led platform delivery for eight product teams.",
    "EDUCATION",
    "State University",
    "BSc, Computer Science",
    "PROJECTS",
    "Release Safety Toolkit",
    "CERTIFICATIONS",
    "Cloud Architecture Professional",
    "LANGUAGES",
    "French",
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

function normalizeResumeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
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
      sectionOrder: [
        "basics",
        "skills",
        "summary",
        "workExperiences",
        "education",
        "projects",
        "certifications",
        "languages",
        "professionalLinks",
      ],
      personal: [sourced("Jordan Avery"), sourced("Paris, France")],
      contact: [
        sourced("jordan.avery@example.test"),
        sourced("+33 6 12 34 56 78"),
      ],
      headline: sourced("Principal Platform Engineer"),
      summary: sourced(
        "Builds reliable, accessible products across international teams.",
      ),
      workExperiences: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          employerName: "Nova Systems",
          employerLocation: "Remote",
          roles: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              title: "Senior Engineer",
              location: "France",
              startDate: { year: 2021, precision: "year" },
              isOngoing: true,
              responsibilities: [
                sourced("Led platform delivery for eight product teams."),
              ],
              achievements: [sourced("Improved availability to 99.99%.")],
            },
          ],
        },
      ],
      education: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          institution: sourced("State University"),
          credential: sourced("BSc"),
          fieldOfStudy: sourced("Computer Science"),
          endDate: { year: 2019, precision: "year" },
        },
      ],
      skills: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          name: sourced("TypeScript"),
        },
      ],
      languages: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: sourced("French"),
          proficiency: sourced("Fluent"),
        },
      ],
      projects: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: sourced("Release Safety Toolkit"),
          description: sourced("Automates privacy-safe release checks."),
          links: [],
        },
      ],
      certifications: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: sourced("Cloud Architecture Professional"),
          issuer: sourced("Example Cloud"),
          issuedAt: { year: 2023, precision: "year" },
        },
      ],
      professionalLinks: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          label: "Portfolio",
          url: sourced("https://jordan.example.test"),
        },
      ],
    },
    createdAt: "2026-08-22T09:00:00.000Z",
    updatedAt: "2026-08-22T09:00:00.000Z",
    sourceAvailability: "source_no_longer_available",
    userMessage: "Loaded.",
  };
}
