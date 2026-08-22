import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const artifactRoot =
  process.env.LOCAL_PLAY_ARTIFACT_DIR ?? "/workspace/.local-play/artifacts";
const validDraftId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const anonymousPdf =
  process.env.LOCAL_PLAY_ANONYMOUS_RESUME_PDF ??
  "/workspace/tests/fixtures/resumes/anonymous-selectable-resume.pdf";
const invalidFixture =
  process.env.LOCAL_PLAY_INVALID_RESUME_FIXTURE ??
  "/workspace/tests/fixtures/resumes/not-a-resume.txt";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await collectSafeDiagnostics(page, testInfo);
});

test("fresh manual draft persists through browser save and reload", async ({
  page,
}) => {
  const telemetry = watchBrowser(page);
  const runId = `fresh ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const fullName = `Alex Fresh ${runId}`;
  const headline = `Browser Regression Engineer ${runId}`;
  const employer = `Synthetic Systems ${runId}`;
  const skill = `Regression Skill ${runId}`;

  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/manual-resume-drafts") &&
      response.request().method() === "POST",
  );
  await page.goto("/resumes/new/manual");
  expect((await created).status()).toBe(201);
  await expect(page).toHaveURL(/\/resumes\/new\/manual\?draftId=/u);
  const url = new URL(page.url());
  expect(url.searchParams.get("draftId")).toMatch(validDraftId);
  expect(url.searchParams.has("creationKey")).toBe(false);

  await fillManualDraft(page, { fullName, headline, employer, skill });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Personal detail" }),
  ).toHaveValue(fullName);
  await expect(
    page.getByRole("textbox", { name: "Professional headline" }),
  ).toHaveValue(headline);
  await page
    .getByRole("button", { name: "Work experience", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Employer", exact: true }),
  ).toHaveValue(employer);
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue(skill);
  assertSameOrigin(telemetry);
});

test("stale manual draft shows not found and recovers with a new draft", async ({
  page,
}) => {
  const telemetry = watchBrowser(page);
  const staleDraftId = "00000000-0000-4000-8000-000000009999";
  const missing = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/manual-resume-drafts/${staleDraftId}`) &&
      response.request().method() === "GET",
  );

  await page.goto(`/resumes/new/manual?draftId=${staleDraftId}`);
  expect((await missing).status()).toBe(404);
  await expect(page.getByText("Draft not found.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a new draft" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/manual-resume-drafts") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create a new draft" }).click();
  expect((await created).status()).toBe(201);
  await expect(
    page.getByRole("button", { name: "Add personal detail" }),
  ).toBeEnabled();
  const recoveredUrl = new URL(page.url());
  expect(recoveredUrl.searchParams.get("draftId")).toMatch(validDraftId);
  expect(recoveredUrl.searchParams.get("draftId")).not.toBe(staleDraftId);
  expect(recoveredUrl.searchParams.has("creationKey")).toBe(false);

  const fullName = `Recovered ${Date.now()}`;
  await fillManualDraft(page, {
    fullName,
    headline: "Recovered Draft Engineer",
    employer: "Recovered Systems",
    skill: "Recovery Testing",
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Personal detail" }),
  ).toHaveValue(fullName);
  assertSameOrigin(telemetry);
});

test("anonymous PDF import reaches review, confirmation, and persisted resume", async ({
  page,
}) => {
  const telemetry = watchBrowser(page);
  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await page
    .getByRole("button", { name: "Resume file" })
    .setInputFiles(anonymousPdf);

  const started = page.waitForResponse(
    (response) =>
      response.url().includes("/api/import-resume") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload and start import" }).click();
  const startResponse = await started;
  expect(startResponse.status()).toBe(201);
  await expect(
    page.getByText("The resume import could not be started."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
  await expect(page.getByText(/Current step:/u)).toBeVisible();

  await page
    .getByRole("button", { name: "Review imported resume" })
    .click({ timeout: 120_000 });
  await expect(page).toHaveURL(/\/import-resume\/[0-9a-f-]+\/review/u);
  await expect(
    page.getByRole("heading", { name: "Review imported resume" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Education" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  await expect(page.getByText("Active fields")).toBeVisible();

  await resolveVisibleWarnings(page);
  await page.getByRole("button", { name: "Confirm field" }).first().click();
  await expect(
    page.getByRole("button", { name: "Create structured resume" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create structured resume" }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm resume creation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm and create resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+/u);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Confirmed structured resume" }),
  ).toBeVisible();
  await expect(
    page.getByText("Created from your reviewed initial resume", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Originally imported from page 1").first(),
  ).toBeVisible();
  await expect(page.getByText(forbiddenPublicText())).toHaveCount(0);
  assertSameOrigin(telemetry);
});

test("unsupported upload keeps specific public recovery message", async ({
  page,
}) => {
  const telemetry = watchBrowser(page);
  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await page
    .getByRole("button", { name: "Resume file" })
    .setInputFiles(invalidFixture);

  const apiPostCountBefore = telemetry.productRequests.filter(
    (url) => url.pathname === "/api/import-resume",
  ).length;
  await page.getByRole("button", { name: "Upload and start import" }).click();
  await expect(
    page
      .getByText("Choose a PDF or DOCX resume file.")
      .or(page.getByText("Choose a resume file before starting the import.")),
  ).toBeVisible();
  await expect(
    page.getByText("The resume import could not be started."),
  ).toHaveCount(0);
  const apiPostCountAfter = telemetry.productRequests.filter(
    (url) => url.pathname === "/api/import-resume",
  ).length;
  expect(apiPostCountAfter).toBe(apiPostCountBefore);
  expect(page.url()).not.toContain("api:3001");
});

async function fillManualDraft(
  page: Page,
  input: {
    readonly fullName: string;
    readonly headline: string;
    readonly employer: string;
    readonly skill: string;
  },
): Promise<void> {
  await page.getByRole("button", { name: "Add personal detail" }).click();
  await page
    .getByRole("textbox", { name: "Personal detail" })
    .fill(input.fullName);
  await page
    .getByRole("textbox", { name: "Professional headline" })
    .fill(input.headline);
  await page
    .getByRole("button", { name: "Work experience", exact: true })
    .click();
  await page.getByRole("button", { name: "Add work experience" }).click();
  await page
    .getByRole("textbox", { name: "Employer", exact: true })
    .fill(input.employer);
  await page
    .getByRole("textbox", { name: "Role title", exact: true })
    .fill("Browser Test Engineer");
  await page
    .getByRole("textbox", { name: "Start year", exact: true })
    .fill("2022");
  await page
    .getByRole("textbox", { name: "End year", exact: true })
    .fill("2026");
  await page.getByRole("button", { name: "Add responsibility" }).click();
  await page
    .getByRole("textbox", { name: "Responsibility 1" })
    .fill("Validated local browser persistence.");
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await page.getByRole("button", { name: "Add skills" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(input.skill);
}

async function resolveVisibleWarnings(page: Page): Promise<void> {
  while (
    (await page.getByRole("button", { name: "Intentionally leave" }).count()) >
    0
  ) {
    await page
      .getByRole("button", { name: "Intentionally leave" })
      .first()
      .click();
    await expect(page.getByRole("status").first()).not.toContainText(
      "Saving review change.",
    );
  }
}

function watchBrowser(page: Page) {
  const telemetry = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedRequests: [] as { pathname: string; status: number }[],
    productRequests: [] as URL[],
    publicErrorCategories: [] as string[],
  };
  page.on("console", (message) => {
    if (message.type() === "error")
      telemetry.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => telemetry.pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      telemetry.productRequests.push(url);
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/") || response.ok()) return;
    telemetry.failedRequests.push({
      pathname: url.pathname,
      status: response.status(),
    });
    void response
      .json()
      .then((body: unknown) => {
        const category = safeCategory(body);
        if (category !== undefined)
          telemetry.publicErrorCategories.push(category);
      })
      .catch(() => undefined);
  });
  Reflect.set(page, "__localPlayTelemetry", telemetry);
  return telemetry;
}

function assertSameOrigin(telemetry: ReturnType<typeof watchBrowser>) {
  expect(telemetry.productRequests.length).toBeGreaterThan(0);
  for (const url of telemetry.productRequests) {
    expect(url.origin).toBe("http://web:3000");
    expect(url.pathname).toMatch(/^\/api(?:\/|$)/u);
    expect(url.href).not.toContain("api:3001");
  }
}

async function collectSafeDiagnostics(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  const directory = join(
    artifactRoot,
    testInfo.title.replace(/[^A-Za-z0-9_.-]+/gu, "-").slice(0, 96),
  );
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: join(directory, "failure-screenshot.png"),
    fullPage: true,
  });
  const telemetry = Reflect.get(page, "__localPlayTelemetry") as
    ReturnType<typeof watchBrowser> | undefined;
  await writeFile(
    join(directory, "safe-diagnostics.json"),
    JSON.stringify(
      {
        finalPathname: new URL(page.url()).pathname,
        consoleErrors: telemetry?.consoleErrors ?? [],
        pageErrors: telemetry?.pageErrors ?? [],
        failedRequests: telemetry?.failedRequests ?? [],
        publicErrorCategories: telemetry?.publicErrorCategories ?? [],
      },
      null,
      2,
    ),
  );
}

function safeCategory(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.code === "string") return record.code;
  const failure = record.failure;
  if (failure !== null && typeof failure === "object") {
    const code = (failure as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function forbiddenPublicText(): RegExp {
  return /storage keys?|storageKey|raw snippets?|bounding boxes?|text item indexes?|PDF item indexes?|parser names?|PdfJs|Ooxml|LibreOffice|api:3001|ownerUserId|sourceStorageKey/iu;
}
