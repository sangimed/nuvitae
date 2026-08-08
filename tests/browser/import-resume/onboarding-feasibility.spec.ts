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

test("local callback returns to import with a persisted ready state", async ({
  page,
}) => {
  let connectionStatus = "not_configured";
  await page.route(
    "**/api/import-resume/provider-connections/codex/status",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-08-08",
          providerKind: "codex",
          connectionStatus,
          authenticationStatus:
            connectionStatus === "connected" ? "authenticated" : "pending",
          availabilityStatus:
            connectionStatus === "connected" ? "available" : "unknown",
          ready: connectionStatus === "connected",
          safeMessage: null,
        }),
      });
    },
  );
  await page.route(
    "**/api/import-resume/provider-connections/codex/oauth/start",
    async (route) => {
      connectionStatus = "login_pending";
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-08-08",
          status: "login_pending",
          loginReference: "login-reference-123456",
          authorizationUrl: "http://localhost:3000/local-oauth-handoff",
        }),
      });
    },
  );
  await page.route(
    "**/api/import-resume/provider-connections/codex/oauth/callback**",
    async (route) => {
      connectionStatus = "connected";
      await route.fulfill({
        status: 303,
        headers: { location: "/import-resume?codex=connected" },
      });
    },
  );

  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await page.getByRole("button", { name: "Connect Codex" }).click();
  await page.goto(
    "/api/import-resume/provider-connections/codex/oauth/callback?state=local-state&code=local-code",
  );
  await page.getByRole("button", { name: "Import my resume" }).click();
  await expect(page.getByText("Codex is ready.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Import my resume" }).click();
  await expect(page.getByText("Codex is ready.")).toBeVisible();
});
