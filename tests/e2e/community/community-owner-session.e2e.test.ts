import { expect, test } from "@playwright/test";

const sessionCookieName = "nuvitae_community_session";

test("Community owner session is browser-safe, persistent on refresh, and revoked on logout", async ({
  page,
}) => {
  const accessSecret = process.env.COMMUNITY_ACCESS_SECRET;
  if (accessSecret === undefined || accessSecret === "") {
    throw new Error("COMMUNITY_ACCESS_SECRET is required.");
  }

  const context = page.context();

  await page.goto("/");
  await expect(page.getByLabel("Access code")).toBeVisible();

  const beforeLogin = await context.request.get(
    "/api/community-auth/session/status",
  );
  expect(beforeLogin.status()).toBe(200);
  expect(await beforeLogin.json()).toEqual({ authenticated: false });

  await page.getByLabel("Access code").fill(accessSecret);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/community-auth/session") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await loginResponsePromise;

  expect(loginResponse.status()).toBe(204);
  expect(loginResponse.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByText("Signed in.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Access code")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(accessSecret);

  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === sessionCookieName);
  expect(session).toBeDefined();
  expect(session?.httpOnly).toBe(true);
  expect(session?.secure).toBe(true);
  expect(session?.sameSite).toBe("Strict");
  expect(session?.path).toBe("/");
  expect(session?.domain).toBe("localhost");

  await page.reload();
  await expect(page.getByText("Signed in.", { exact: true })).toBeVisible();

  const authenticated = await context.request.get(
    "/api/community-auth/session/status",
  );
  expect(authenticated.status()).toBe(200);
  expect(await authenticated.json()).toEqual({ authenticated: true });

  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/community-auth/session") &&
      response.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  const logoutResponse = await logoutResponsePromise;

  expect(logoutResponse.status()).toBe(204);
  expect(logoutResponse.headers()["cache-control"]).toContain("no-store");
  expect(logoutResponse.headers()["clear-site-data"]).toBe('"cache"');
  await expect(page.getByLabel("Access code")).toBeVisible();

  expect(
    (await context.cookies()).find((cookie) => cookie.name === sessionCookieName),
  ).toBeUndefined();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  const afterLogout = await context.request.get(
    "/api/community-auth/session/status",
  );
  expect(afterLogout.status()).toBe(200);
  expect(await afterLogout.json()).toEqual({ authenticated: false });
});
