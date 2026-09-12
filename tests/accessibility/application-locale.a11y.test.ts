import { expect, test } from "@playwright/test";

// The dev HMR handshake fails on the numeric loopback origin in the orb,
// leaving SSR markup unhydrated. Use localhost without bypassing CSP.
test.use({ baseURL: "http://localhost:3000" });

test("default locale and French preference survive reload without hydration errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  const selector = page.getByRole("combobox", { name: "Application language" });
  await selector.focus();
  await expect(selector).toBeFocused();
  expect(
    await selector.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe("none");
  await selector.selectOption("fr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Créez un CV que vous serez fier d’envoyer.",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  expect(
    (await page.context().cookies()).find(
      (cookie) => cookie.name === "nuvitae-app-locale",
    ),
  ).toMatchObject({ value: "fr", sameSite: "Lax", path: "/" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Créez un CV que vous serez fier d’envoyer.",
  );
  await expect(
    page.getByRole("combobox", { name: "Langue de l’application" }),
  ).toHaveValue("fr");
  await expect(
    page.getByRole("navigation", { name: "Navigation principale" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Arabic browser preference renders RTL and fits a narrow viewport", async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: "ar",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    const response = await page.goto("/");
    expect(await response?.text()).toContain('lang="ar" dir="rtl"');
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "أنشئ سيرة ذاتية ترسلها بثقة.",
    );
    await expect(
      page.getByRole("combobox", { name: "لغة التطبيق" }),
    ).toHaveValue("ar");
    expect(
      await page
        .locator("main")
        .evaluate((element) => getComputedStyle(element).direction),
    ).toBe("rtl");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("main")
      .getByRole("link", { name: "استيراد سيرة ذاتية" })
      .click();
    await expect(page).toHaveURL(/\/import-resume$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "ابدأ بسيرتك الذاتية الحالية",
    );
    await page.getByRole("button", { name: "استيراد سيرتي الذاتية" }).click();
    const importFlow = page.locator('[lang="ar"][dir="rtl"]');
    await expect(importFlow.getByRole("heading", { level: 1 })).toHaveText(
      "اختر ملف السيرة الذاتية لاستيراده",
    );
    await expect(
      importFlow.getByText("قبل التحميل", { exact: true }),
    ).toBeVisible();
    await expect(
      importFlow.getByText("كيف يساعد Codex في استيراد سيرتك الذاتية", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await importFlow.evaluate(
        (element) => getComputedStyle(element).direction,
      ),
    ).toBe("rtl");
  } finally {
    await context.close();
  }
});

test("switching application language keeps unsaved resume text and sends no resume write", async ({
  page,
}) => {
  const content = {
    personal: [
      {
        value: "Synthetic Example",
        sourceStatus: "user_added",
        confidenceStatus: "not_applicable",
        inferenceStatus: "not_inferred",
      },
    ],
    contact: [],
    summary: {
      value: "原始摘要 — expérience",
      sourceStatus: "user_added",
      confidenceStatus: "not_applicable",
      inferenceStatus: "not_inferred",
    },
    workExperiences: [],
    education: [],
    skills: [],
    languages: [],
    projects: [],
    certifications: [],
    professionalLinks: [],
  };
  const expectedContent = {
    ...content,
    headline: {
      value: "مهندسة — Paris — 中文",
      sourceStatus: "user_added",
      confidenceStatus: "not_applicable",
      inferenceStatus: "not_inferred",
    },
  };
  const requests: string[] = [];
  const writes: unknown[] = [];
  await page.route("**/manual-resume-drafts**", async (route) => {
    const method = route.request().method();
    requests.push(method);
    if (method !== "GET") writes.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        version: "2026-07-28",
        requestId: "22222222-2222-4222-8222-222222222222",
        status: "manual_draft",
        draft: {
          draftId: "11111111-1111-4111-8111-111111111111",
          source: "manual_entry",
          status: "editing",
          content: method === "PATCH" ? expectedContent : content,
          createdAt: "2026-07-29T09:30:00.000Z",
          updatedAt: "2026-07-29T09:30:00.000Z",
        },
        userMessage: "Your manual resume draft is ready.",
      },
    });
  });
  await page.goto(
    "/resumes/new/manual?draftId=11111111-1111-4111-8111-111111111111",
  );
  const headline = page.getByRole("textbox", { name: "Professional headline" });
  await headline.fill("مهندسة — Paris — 中文");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  const beforeUrl = page.url();
  const beforeRequests = [...requests];
  await page
    .getByRole("combobox", { name: "Application language" })
    .selectOption("ar");
  await expect(headline).toHaveValue("مهندسة — Paris — 中文");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const preview = page.locator("[data-resume-template]");
  await expect(preview).toHaveAttribute("dir", "auto");
  expect(
    await preview.evaluate((element) => getComputedStyle(element).direction),
  ).toBe("ltr");
  await expect(preview).toContainText("原始摘要 — expérience");
  expect(
    (await page.context().cookies()).find(
      (cookie) => cookie.name === "nuvitae-app-locale",
    )?.value,
  ).toBe("ar");
  await page.getByRole("combobox", { name: "لغة التطبيق" }).selectOption("fr");
  await expect(headline).toHaveValue("مهندسة — Paris — 中文");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(beforeUrl);
  expect(requests).toEqual(beforeRequests);
  expect(writes).toEqual([]);

  // Saving is explicit and must preserve the entire original document plus
  // exactly the user's edit, with no application-locale field in the payload.
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(writes).toEqual([
    { expectedUpdatedAt: "2026-07-29T09:30:00.000Z", content: expectedContent },
  ]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
