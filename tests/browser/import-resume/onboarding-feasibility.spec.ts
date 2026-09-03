import { expect, test } from "@playwright/test";

test("disconnected import flow exposes an actionable Connect Codex handoff", async ({
  page,
}) => {
  await page.route(
    "**/api/import-resume/provider-connections/codex/status",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-08-08",
          providerKind: "codex",
          connectionStatus: "not_configured",
          authenticationStatus: "unauthenticated",
          availabilityStatus: "unknown",
          ready: false,
          safeMessage: null,
        }),
      });
    },
  );
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
          authorizationUrl: "https://auth.openai.com/codex/device",
          userCode: "ABCD-EFGH",
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

  const popupPromise = page.waitForEvent("popup");
  await connect.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/^https:\/\/auth\.openai\.com\//);
  await expect(page.getByText("ABCD-EFGH", { exact: true })).toBeVisible();
});

test("device authorization polling reaches a persisted ready state", async ({
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
          authorizationUrl: "https://auth.openai.com/codex/device",
          userCode: "ABCD-EFGH",
        }),
      });
      connectionStatus = "connected";
    },
  );
  await page.route("https://auth.openai.com/**", async (route) => {
    await route.fulfill({ status: 200, body: "OpenAI device authorization" });
  });

  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await page.getByRole("button", { name: "Connect Codex" }).click();
  await expect(page.getByText("Codex is ready.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Import my resume" }).click();
  await expect(page.getByText("Codex is ready.")).toBeVisible();
});

test("connected users can disconnect and use the bounded reconnect handoff", async ({
  page,
}) => {
  let connectionStatus = "connected";
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
            connectionStatus === "connected"
              ? "authenticated"
              : "unauthenticated",
          availabilityStatus:
            connectionStatus === "connected" ? "available" : "unknown",
          ready: connectionStatus === "connected",
          safeMessage: null,
        }),
      });
    },
  );
  await page.route(
    "**/api/import-resume/provider-connections/codex/disconnect",
    async (route) => {
      connectionStatus = "disconnected";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-08-08",
          providerKind: "codex",
          connectionStatus,
          authenticationStatus: "unauthenticated",
          availabilityStatus: "unknown",
          ready: false,
          safeMessage: null,
        }),
      });
    },
  );
  await page.route(
    "**/api/import-resume/provider-connections/codex/oauth/start",
    async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-08-08",
          status: "login_pending",
          loginReference: "login-reference-reconnect",
          authorizationUrl: "https://auth.openai.com/codex/device",
          userCode: "ABCD-EFGH",
        }),
      });
    },
  );

  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await expect(page.getByText("Codex is ready.")).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your uploaded resume, review, and saved resume data will stay here.",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(
    page.getByText("Codex disconnected. Your resume data is still here."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconnect Codex" }),
  ).toBeVisible();
  await page.route("https://auth.openai.com/**", async (route) => {
    await route.fulfill({ status: 200, body: "local OAuth boundary" });
  });
  const reconnectPopupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Reconnect Codex" }).click();
  const reconnectPopup = await reconnectPopupPromise;
  await expect(reconnectPopup).toHaveURL(/^https:\/\/auth\.openai\.com\//);
});

test("expired and revoked states offer a bounded reconnect handoff", async ({
  page,
}) => {
  for (const connectionStatus of [
    "authentication_expired",
    "authentication_revoked",
  ]) {
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
              connectionStatus === "authentication_expired"
                ? "expired"
                : "revoked",
            availabilityStatus: "unknown",
            ready: false,
            safeMessage: null,
          }),
        });
      },
    );
    await page.route(
      "**/api/import-resume/provider-connections/codex/oauth/start",
      async (route) => {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            version: "2026-08-08",
            status: "login_pending",
            loginReference: `login-reference-${connectionStatus}`,
            authorizationUrl: "https://auth.openai.com/codex/device",
            userCode: "ABCD-EFGH",
          }),
        });
      },
    );
    await page.goto("/import-resume");
    await page.getByRole("button", { name: "Import my resume" }).click();
    await expect(
      page.getByRole("button", { name: "Reconnect Codex" }),
    ).toBeVisible();
    await page.route("https://auth.openai.com/**", async (route) => {
      await route.fulfill({ status: 200, body: "local OAuth boundary" });
    });
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Reconnect Codex" }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/^https:\/\/auth\.openai\.com\//);
    await popup.close();
  }
});

test("temporary Codex unavailability preserves connection and resume data", async ({
  page,
}) => {
  await page.route(
    "**/api/import-resume/provider-connections/codex/status",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "2026-08-08",
          providerKind: "codex",
          connectionStatus: "connected",
          authenticationStatus: "authenticated",
          availabilityStatus: "unavailable",
          ready: false,
          safeMessage: "Codex is temporarily unavailable.",
        }),
      });
    },
  );
  await page.goto("/import-resume");
  await page.getByRole("button", { name: "Import my resume" }).click();
  await expect(
    page.getByText("Your connection and resume data are still here."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconnect Codex" }),
  ).toHaveCount(0);
});
