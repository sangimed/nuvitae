import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const require = createRequire(__filename);
type PdfDocumentInstance = {
  on(event: "data", handler: (chunk: Buffer) => void): void;
  on(event: "end", handler: () => void): void;
  on(event: "error", handler: (error: Error) => void): void;
  fontSize(size: number): void;
  text(value: string): void;
  end(): void;
};

type PdfDocumentConstructor = new (options: {
  readonly size: string;
  readonly margin: number;
}) => PdfDocumentInstance;

type YazlZipFile = {
  readonly outputStream: NodeJS.ReadableStream;
  addBuffer(content: Buffer, path: string): void;
  end(): void;
};

const PDFDocument = require(
  require.resolve("pdfkit", {
    paths: ["/workspace/packages/extraction", process.cwd()],
  }),
) as PdfDocumentConstructor;
const yazl = require(
  require.resolve("yazl", {
    paths: ["/workspace/packages/extraction", process.cwd()],
  }),
) as { readonly ZipFile: new () => YazlZipFile };

test.describe.configure({ mode: "serial" });

test("manual, PDF, DOCX, same-origin, and local security flows use the real local stack", async ({
  page,
  request,
}) => {
  const runId = `E2E ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const productRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/") || url.endsWith("/api"))
      productRequests.push(url);
  });

  await verifyLocalModeBanner(page);
  await completeManualFlow(page, runId);
  await completePdfFlow(page, runId);
  await completeDocxFlow(page, runId);
  await verifySameOrigin(productRequests);
  await verifyLocalAuthenticationBoundary(request);
});

async function verifyLocalModeBanner(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Create your resume" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Local play mode");
  await expect(page.getByRole("status")).toContainText(
    "not production authentication",
  );
}

async function completeManualFlow(page: Page, runId: string): Promise<void> {
  const fullName = `Synthetic Manual ${runId}`;
  const headline = `Manual Local Stack Engineer ${runId}`;
  const employer = `Manual Systems ${runId}`;
  const skill = `Manual Skill ${runId}`;

  await page.getByRole("link", { name: "Create a resume manually" }).click();
  await expect(
    page.getByRole("heading", { name: "Manual resume draft" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add personal detail" }),
  ).toBeEnabled();

  await page.getByRole("button", { name: "Add personal detail" }).click();
  await page.getByRole("textbox", { name: "Personal detail" }).fill(fullName);
  await page
    .getByRole("textbox", { name: "Professional headline" })
    .fill(headline);
  await page
    .getByRole("button", { name: "Work experience", exact: true })
    .click();
  await page.getByRole("button", { name: "Add work experience" }).click();
  await page
    .getByRole("textbox", { name: "Employer", exact: true })
    .fill(employer);
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
    .fill("Validated the local playable stack.");
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await page.getByRole("button", { name: "Add skills" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(skill);

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
}

async function completePdfFlow(page: Page, runId: string): Promise<void> {
  const suffix = uniqueSuffix(runId);
  const headline = `PDF Engineer ${suffix}`;
  const skill = `PDF Skill ${suffix}`;
  const pdfPath = await createPdfFixture({
    fileName: "local-play-selectable.pdf",
    lines: [
      "The candidate built project work with the team.",
      `Name: Synthetic PDF ${suffix}`,
      "Email: pdf-candidate@example.test",
      `Headline: ${headline}`,
      "Summary: Builds reliable local services.",
      `Skills: ${skill}, PostgreSQL, Docker`,
    ],
  });

  await uploadDocument(page, pdfPath);
  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Current step: checking the document|Current step: reading the content|Current step: organizing resume sections|Current step: preparing review/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review imported resume" })
    .click({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/import-resume\/[0-9a-f-]+\/review/);
  await expect(
    page.getByRole("heading", { name: "Review imported resume" }),
  ).toBeVisible();
  await expect(page.getByText("Imported from page 1").first()).toBeVisible();

  await confirmAllUnreviewedFields(page);
  await resolveAllVisibleWarnings(page);
  await expect(
    page.getByRole("button", { name: "Create structured resume" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create structured resume" }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm resume creation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm and create resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Confirmed structured resume" }),
  ).toBeVisible();
  await expect(page.getByText(headline)).toBeVisible();
  await expect(page.getByText(skill)).toBeVisible();
  await expect(
    page.getByText("Created from your reviewed initial resume", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Originally imported from page 1").first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      /users\/|imports\/|source\/|parser-input|parser-output|PdfJs|Ooxml|LibreOffice|storage/i,
    ),
  ).toHaveCount(0);
}

async function completeDocxFlow(page: Page, runId: string): Promise<void> {
  const suffix = uniqueSuffix(runId);
  const headline = `DOCX Engineer ${suffix}`;
  const docxPath = await createDocxFixture({
    fileName: "local-play.docx",
    lines: [
      "The candidate built project work with the team.",
      `Name: Synthetic DOCX ${suffix}`,
      "Email: docx-candidate@example.test",
      `Headline: ${headline}`,
      "Summary: Builds reliable document services.",
      `Skills: DOCX Skill ${suffix}, LibreOffice, Docker`,
    ],
  });
  await uploadDocument(page, docxPath);
  await expect(
    page.getByRole("heading", { name: "Preparing your resume for review" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review imported resume" })
    .click({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/import-resume\/[0-9a-f-]+\/review/);
  await expect(
    page.getByRole("heading", { name: "Review imported resume" }),
  ).toBeVisible();
  await expect(
    page.getByText("Imported from the document body").first(),
  ).toBeVisible();
  await expect(page.getByText(headline)).toBeVisible();
}

function uniqueSuffix(runId: string): string {
  return runId.replace(/[^A-Za-z0-9]/g, "").slice(-10);
}

async function uploadDocument(page: Page, filePath: string): Promise<void> {
  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole("button", { name: "Upload and start import" }).click();
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

async function verifySameOrigin(
  productRequests: readonly string[],
): Promise<void> {
  expect(productRequests.length).toBeGreaterThan(0);
  for (const url of productRequests) {
    expect(url).toMatch(/^http:\/\/web:3000\/api(?:\/|$)/);
    expect(url).not.toContain("api:3001");
  }
}

async function verifyLocalAuthenticationBoundary(
  request: APIRequestContext,
): Promise<void> {
  const creationKey = `header-switch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const attackerUserId = "99999999-9999-4999-8999-999999999999";
  const created = await request.post("/api/manual-resume-drafts", {
    headers: { "X-User-Id": attackerUserId },
    data: { creationKey },
  });
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as {
    readonly draft: { readonly draftId: string };
  };
  const readBack = await request.get(
    `/api/manual-resume-drafts/${createdBody.draft.draftId}`,
  );
  expect(readBack.status()).toBe(200);

  const ownerBody = await request.post("/api/manual-resume-drafts", {
    data: {
      creationKey: `${creationKey}-owner-body`,
      ownerUserId: attackerUserId,
    },
  });
  expect(ownerBody.status()).toBe(400);

  const disabledBaseUrl = process.env.LOCAL_PLAY_DISABLED_API_URL;
  expect(disabledBaseUrl).toBeTruthy();
  const disabled = await request.post(
    `${disabledBaseUrl}/manual-resume-drafts`,
    {
      headers: { "X-User-Id": attackerUserId },
      data: { creationKey: `${creationKey}-disabled` },
    },
  );
  expect(disabled.status()).toBe(401);
}

async function createPdfFixture(input: {
  readonly fileName: string;
  readonly lines: readonly string[];
}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nuvitae-local-play-pdf-"));
  const filePath = join(directory, input.fileName);
  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({ size: "LETTER", margin: 72 });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => {
      void writeFile(filePath, Buffer.concat(chunks)).then(resolve, reject);
    });
    document.on("error", reject);
    document.fontSize(16);
    for (const line of input.lines) document.text(line);
    document.end();
  });
  return filePath;
}

async function createDocxFixture(input: {
  readonly fileName: string;
  readonly lines: readonly string[];
}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nuvitae-local-play-docx-"));
  const filePath = join(directory, input.fileName);
  const zip = new yazl.ZipFile();
  zip.addBuffer(
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "[Content_Types].xml",
  );
  zip.addBuffer(
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "_rels/.rels",
  );
  const body = input.lines.map((line) => paragraph(line)).join("");
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
    ),
    "word/document.xml",
  );
  await new Promise<void>((resolve, reject) => {
    zip.outputStream
      .pipe(createWriteStream(filePath))
      .on("close", resolve)
      .on("error", reject);
    zip.end();
  });
  return filePath;
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
