import { expect, test, type Page } from "@playwright/test";

test.describe("Community application shell accessibility", () => {
  test("exposes product navigation and owner access without developer status", async ({
    page,
  }) => {
    await stubSignedOutOwner(page);
    await page.goto("/");

    const navigation = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await expect(navigation).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Nuvitae home" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Home", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Import resume" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create resume" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Create your resume",
    );
    await expect(page.getByLabel("Owner access secret")).toBeVisible();
    await expect(page.getByText("API route")).toHaveCount(0);
    await expect(page.getByText("Local Play", { exact: false })).toHaveCount(0);

    const importLink = page.getByRole("link", { name: "Import resume" });
    await importLink.focus();
    await expect(importLink).toBeFocused();
    expect(
      await importLink.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      ),
    ).not.toBe("none");
  });

  test("keeps every journey reachable without narrow-viewport overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await stubSignedOutOwner(page);
    await page.goto("/");

    for (const name of ["Home", "Import resume", "Create resume"]) {
      const link = page.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});

async function stubSignedOutOwner(page: Page) {
  await page.route("**/api/community-auth/session/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false }),
    });
  });
}
