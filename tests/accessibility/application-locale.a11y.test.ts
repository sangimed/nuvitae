import { expect, test } from "@playwright/test";

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
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
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
  } finally {
    await context.close();
  }
});

test("switching application language keeps unsaved resume text and sends no resume write", async ({
  page,
}) => {
  const writes: string[] = [];
  await page.route("**/manual-resume-drafts**", async (route) => {
    if (!["GET", "POST"].includes(route.request().method()))
      writes.push(route.request().method());
    await route.fulfill({
      json: {
        version: "2026-07-28",
        requestId: "22222222-2222-4222-8222-222222222222",
        status: "manual_draft",
        draft: {
          draftId: "11111111-1111-4111-8111-111111111111",
          source: "manual_entry",
          status: "editing",
          content: {
            personal: [],
            contact: [],
            workExperiences: [],
            education: [],
            skills: [],
            languages: [],
            projects: [],
            certifications: [],
            professionalLinks: [],
          },
          createdAt: "2026-07-29T09:30:00.000Z",
          updatedAt: "2026-07-29T09:30:00.000Z",
        },
        userMessage: "Your manual resume draft is ready.",
      },
    });
  });
  await page.goto("/resumes/new/manual");
  const headline = page.getByRole("textbox", { name: "Professional headline" });
  await headline.fill("مهندسة — Paris — 中文");
  const beforeUrl = page.url();
  await page
    .getByRole("combobox", { name: "Application language" })
    .selectOption("ar");
  await expect(headline).toHaveValue("مهندسة — Paris — 中文");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("combobox", { name: "لغة التطبيق" }).selectOption("fr");
  await expect(headline).toHaveValue("مهندسة — Paris — 中文");
  expect(page.url()).toBe(beforeUrl);
  expect(writes).toEqual([]);
});
