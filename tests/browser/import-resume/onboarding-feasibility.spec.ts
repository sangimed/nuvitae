import { expect, test } from "@playwright/test";

test("disconnected import flow exposes an actionable Connect Codex handoff", async ({
  page,
}) => {
  await page.route(
    "**/api/import-resume/provider-connections/codex/oauth/start",
    async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-08-08",
          status: "login_pending",
          loginReference: "login-reference-123456",
          authorizationUrl:
            "https://auth.openai.com/oauth/authorize?state=local-test",
        }),
      });
    },
  );
  await page.route("https://auth.openai.com/**", async (route) => {
    await route.fulfill({ status: 200, body: "local OAuth boundary" });
  });

  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();

  const connect = page.getByRole("button", { name: "Connect Codex" });
  await expect(connect).toBeVisible();
  await expect(connect).toBeEnabled();
  await expect(
    page.getByText("Connect Codex so Nuvitae can organize your resume."),
  ).toBeVisible();

  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of [
    "oauth",
    "token",
    "api key",
    "authorization code",
    "broker",
    "credential",
    "model",
    "worker",
  ]) {
    expect(body).not.toContain(forbidden);
  }
  await expect(page.getByText("Codex is ready")).toHaveCount(0);

  await connect.click();
  await expect(page).toHaveURL(
    "https://auth.openai.com/oauth/authorize?state=local-test",
  );
});
