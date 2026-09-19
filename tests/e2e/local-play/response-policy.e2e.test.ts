import { expect, test } from "../../browser/csp-fixture";

interface HeaderResponse {
  headers(): Record<string, string>;
}

const reportOnly = process.env.EXPECT_CSP_REPORT_ONLY !== "false";
const cspHeader = reportOnly
  ? "content-security-policy-report-only"
  : "content-security-policy";
const otherCspHeader = reportOnly
  ? "content-security-policy"
  : "content-security-policy-report-only";

test.beforeAll(() => {
  expect(["true", "false"]).toContain(process.env.EXPECT_CSP_REPORT_ONLY);
});

test("built web verifies response headers and records CSP rollout compatibility", async ({
  page,
}) => {
  const staticResponsePromise = page.waitForResponse((response) =>
    /\/_next\/static\/.*\.(?:css|woff2?)(?:\?|$)/u.test(response.url()),
  );
  const publicResponse = await page.goto("/");
  expect(publicResponse).not.toBeNull();
  assertBrowserPolicy(publicResponse!);
  expect(publicResponse!.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const fontStatuses = await page.evaluate(() =>
    // next/font's local Arial fallback can be absent in Linux containers.
    // Assert the downloaded web fonts, not optional OS font availability.
    [...document.fonts]
      .filter((font) => !font.family.endsWith(" Fallback"))
      .map((font) => font.status),
  );
  expect(fontStatuses).toContain("loaded");
  expect(fontStatuses).not.toContain("error");

  const staticResponse = await staticResponsePromise;
  assertBrowserPolicy(staticResponse);
  expect(staticResponse.headers()["cache-control"]).toContain("immutable");
  expect(staticResponse.headers()["cache-control"]).not.toContain("no-store");

  const errorResponse = await page.goto("/response-policy-missing-page");
  expect(errorResponse?.status()).toBe(404);
  assertBrowserPolicy(errorResponse!);
  expect(errorResponse!.headers()["cache-control"]).toContain("no-store");
  await expect(
    page.getByRole("heading", { name: "404", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main [style], main style")).toHaveCount(0);

  const personalResponse = await page.goto("/resumes/new/manual");
  assertBrowserPolicy(personalResponse!);
  assertNoStore(personalResponse!);
  expect(personalResponse!.headers()[cspHeader]).not.toBe(
    publicResponse!.headers()[cspHeader],
  );
  await expect(
    page.getByRole("heading", { name: "Manual resume draft" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add personal detail" }).click();
  await page
    .getByRole("textbox", { name: "Personal detail" })
    .fill("Synthetic CSP Resume");
  await page
    .getByRole("textbox", { name: "Professional headline" })
    .fill("Browser Policy Engineer");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Personal detail" }),
  ).toHaveValue("Synthetic CSP Resume");
  await page.emulateMedia({ media: "print" });
  expect(
    (await page.pdf({ format: "A4", printBackground: true })).byteLength,
  ).toBeGreaterThan(10_000);
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("link", { name: "My resumes", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/resumes$/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("built web and API mark representative API responses no-store", async ({
  request,
}) => {
  const publicApi = await request.get("/api/health/live");
  expect(publicApi.status()).toBe(200);
  assertApiPolicy(publicApi);
  assertNoStore(publicApi);

  const authenticatedPersonal = await request.get("/api/resumes");
  expect(authenticatedPersonal.status()).toBe(200);
  assertApiPolicy(authenticatedPersonal);
  assertNoStore(authenticatedPersonal);

  const providerStatus = await request.get(
    "/api/import-resume/provider-connections/codex/status",
  );
  expect(providerStatus.status()).toBe(200);
  assertApiPolicy(providerStatus);
  assertNoStore(providerStatus);

  const apiError = await request.get("/api/structured-resumes/not-a-uuid");
  expect(apiError.status()).toBeGreaterThanOrEqual(400);
  assertApiPolicy(apiError);
  assertNoStore(apiError);

  const malformed = await request.post("/api/community-auth/session", {
    headers: { "content-type": "application/json" },
    data: "{",
  });
  expect(malformed.status()).toBe(400);
  assertApiPolicy(malformed);
  assertNoStore(malformed);
});

test("built production API hides OpenAPI and clears cache at logout", async ({
  playwright,
}) => {
  const baseURL = process.env.PRODUCTION_POLICY_API_URL;
  const webBaseURL = process.env.PRODUCTION_POLICY_WEB_URL;
  const accessSecret = process.env.PRODUCTION_POLICY_ACCESS_SECRET;
  if (
    baseURL === undefined ||
    webBaseURL === undefined ||
    accessSecret === undefined
  ) {
    throw new Error(
      "Production response-policy test configuration is missing.",
    );
  }
  const productionApi = await playwright.request.newContext({ baseURL });
  const productionWeb = await playwright.request.newContext({
    baseURL: webBaseURL,
  });

  try {
    for (const path of ["/openapi", "/openapi-json", "/openapi-yaml"]) {
      // Local Play intentionally enables development Swagger. Use a web build
      // whose rewrite targets the production API for the production boundary.
      for (const openApi of [
        await productionApi.get(path),
        await productionWeb.get(`/api${path}`),
      ]) {
        expect(openApi.status()).toBe(404);
        expect(openApi.headers()["strict-transport-security"]).toBeUndefined();
        assertApiPolicy(openApi);
        assertNoStore(openApi);
      }
    }

    const unauthenticated = await productionApi.get("/resumes");
    expect(unauthenticated.status()).toBe(401);
    assertNoStore(unauthenticated);

    const login = await productionApi.post("/community-auth/session", {
      data: { accessSecret },
    });
    expect(login.status()).toBe(204);
    expect(login.headers()["set-cookie"]).toContain("Secure");
    assertNoStore(login);

    const sessionCookie = login.headers()["set-cookie"]?.split(";", 1)[0];
    expect(sessionCookie).toBeTruthy();
    const status = await productionApi.get("/community-auth/session/status", {
      headers: { cookie: sessionCookie! },
    });
    expect(status.status()).toBe(200);
    expect(await status.json()).toEqual({ authenticated: true });
    assertNoStore(status);

    const logout = await productionApi.delete("/community-auth/session", {
      headers: { cookie: sessionCookie! },
    });
    expect(logout.status()).toBe(204);
    expect(logout.headers()["clear-site-data"]).toBe('"cache"');
    assertNoStore(logout);

    const revoked = await productionApi.get("/resumes", {
      headers: { cookie: sessionCookie! },
    });
    expect(revoked.status()).toBe(401);
    assertNoStore(revoked);
  } finally {
    await productionApi.dispose();
    await productionWeb.dispose();
  }
});

function assertBrowserPolicy(response: HeaderResponse): void {
  const headers = response.headers();
  const policy = headers[cspHeader];
  expect(policy).toBeTruthy();
  expect(headers[otherCspHeader]).toBeUndefined();
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/u);
  expect(policy).toMatch(/style-src 'self' 'nonce-[^']+'/u);
  expect(policy).not.toContain("unsafe-inline");
  expect(policy).not.toContain("unsafe-eval");
  assertCommonPolicy(response);
}

function assertApiPolicy(response: HeaderResponse): void {
  expect(response.headers()["content-security-policy"]).toBe(
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  expect(
    response.headers()["content-security-policy-report-only"],
  ).toBeUndefined();
  assertCommonPolicy(response);
}

function assertCommonPolicy(response: HeaderResponse): void {
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toBe(
    "camera=(), geolocation=(), microphone=()",
  );
  expect(headers["strict-transport-security"]).toBeUndefined();
}

function assertNoStore(response: HeaderResponse): void {
  expect(response.headers()["cache-control"]).toContain("no-store");
}
