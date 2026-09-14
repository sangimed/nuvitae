import { expect, test as base } from "@playwright/test";

// Retain events outside the document so reloads and route transitions cannot
// erase evidence. Never retain personal URLs, samples, or raw console messages.
export const test = base.extend<{ csp: void }>({
  csp: [
    async ({ page }, use, testInfo) => {
      // The standard browser config runs next dev (HMR/eval), not the built
      // production runtime. Compose explicitly selects the built-policy mode.
      if (process.env.EXPECT_CSP_REPORT_ONLY === undefined) {
        await use();
        return;
      }
      const violations: unknown[] = [];
      let consoleViolations = 0;
      await page.exposeFunction("recordCspViolation", (event: unknown) => {
        violations.push(event);
      });
      page.on("console", (message) => {
        if (/content security policy/iu.test(message.text())) {
          consoleViolations += 1;
        }
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          const source = new URL(event.sourceFile || location.href);
          void (
            window as Window & {
              recordCspViolation: (event: unknown) => Promise<void>;
            }
          ).recordCspViolation({
            directive: event.effectiveDirective,
            disposition: event.disposition,
            source: source.pathname.startsWith("/_next/static/")
              ? source.pathname
              : "document",
            line: event.lineNumber,
            column: event.columnNumber,
            blocked: ["inline", "eval"].includes(event.blockedURI)
              ? event.blockedURI
              : "resource",
          });
        });
      });
      await use();
      await page.waitForTimeout(100);
      await testInfo.attach("csp-compatibility", {
        body: JSON.stringify({ violations, consoleViolations }),
        contentType: "application/json",
      });
      expect(
        violations,
        "Zero CSP events in report-only AND enforcement",
      ).toEqual([]);
      expect(consoleViolations, "Zero CSP console violations").toBe(0);
    },
    { auto: true },
  ],
});

export { expect };
