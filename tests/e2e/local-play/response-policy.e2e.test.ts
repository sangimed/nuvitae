import { expect, test } from "@playwright/test";

interface HeaderResponse {
  headers(): Record<string, string>;
}

const reportOnly = process.env.EXPECT_CSP_REPORT_ONLY === "true";
const cspHeader = reportOnly
  ? "content-security-policy-report-only"
  : "content-security-policy";
const otherCspHeader = reportOnly
  ? "content-security-policy"
  : "content-security-policy-report-only";

test("built web serves the derived browser policy without breaking fonts or print", async ({
  page,
}) => {
  const browserPolicyMessages: string[] = [];
  page.on("console", (message) => {
    if (
      /violates the following content security policy directive/iu.test(
        message.text(),
      )
    ) {
      browserPolicyMessages.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.defineProperty(window, "__nuvitaeCspViolations", {
      value: violations,
    });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(
        `${event.effectiveDirective}:${event.blockedURI || "inline"}`,
      );
    });
  });

  const staticResponsePromise = page.waitForResponse((response) =>
    /\/_next\/static\/.*\.(?:css|woff2?)(?:\?|$)/u.test(response.url()),
  );
  const publicResponse = await page.goto("/");
  expect(publicResponse).not.toBeNull();
  assertBrowserPolicy(publicResponse!);
  expect(publicResponse!.headers()["cache-control"]).toContain("no-store");
  await expect(
    page.getByRole("heading", { name: "Create your resume" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const fontStatuses = await page.evaluate(() =>
    [...document.fonts].map((font) => font.status),
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

  await page.goto("/resumes/new/manual");
  await expect(
    page.getByRole("heading", { name: "Manual resume draft" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  expect(
    (await page.pdf({ format: "A4", printBackground: true })).byteLength,
  ).toBeGreaterThan(10_000);

  await page.waitForTimeout(100);
  const violations = await page.evaluate(
    () =>
      (
        window as Window & { readonly __nuvitaeCspViolations?: string[] }
      ).__nuvitaeCspViolations ?? [],
  );
  expect(violations).toEqual([]);
  expect(browserPolicyMessages).toEqual([]);
  console.log(
    `CSP ${reportOnly ? "report-only trial" : "enforcement"}: 0 browser violations across public, error, font, manual-resume, and print states.`,
  );
});

test("built web and API mark representative API responses no-store", async ({
  request,
}) => {
  const publicApi = await request.get("/api/health/live");
  expect(publicApi.status()).toBe(200);
  assertBrowserPolicy(publicApi);
  assertNoStore(publicApi);

  const authenticatedPersonal = await request.get("/api/resumes");
  expect(authenticatedPersonal.status()).toBe(200);
  assertBrowserPolicy(authenticatedPersonal);
  assertNoStore(authenticatedPersonal);

  const providerStatus = await request.get(
    "/api/import-resume/provider-connections/codex/status",
  );
  expect(providerStatus.status()).toBe(200);
  assertBrowserPolicy(providerStatus);
  assertNoStore(providerStatus);

  const apiError = await request.get("/api/structured-resumes/not-a-uuid");
  expect(apiError.status()).toBeGreaterThanOrEqual(400);
  assertBrowserPolicy(apiError);
  assertNoStore(apiError);
});

test("built production API hides OpenAPI and clears cache at logout", async ({
  playwright,
}) => {
  const baseURL = process.env.PRODUCTION_POLICY_API_URL;
  const accessSecret = process.env.PRODUCTION_POLICY_ACCESS_SECRET;
  if (baseURL === undefined || accessSecret === undefined) {
    throw new Error("Production response-policy test configuration is missing.");
  }
  const productionApi = await playwright.request.newContext({ baseURL });

  try {
    const openApi = await productionApi.get("/openapi");
    expect(openApi.status()).toBe(404);
    expect(openApi.headers()["strict-transport-security"]).toBeUndefined();
    assertNoStore(openApi);

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
  } finally {
    await productionApi.dispose();
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
