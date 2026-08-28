// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

describe("AppShell", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("renders product branding and accessible primary navigation with Home current", () => {
    const rendered = renderToStaticMarkup(
      <AppShell localPlayMode={true}>
        <main>Page content</main>
      </AppShell>,
    );

    expect(rendered).toContain('aria-label="Primary navigation"');
    expect(rendered).toContain('href="/"');
    expect(rendered).toContain("Nuvitae");
    expect(rendered).toContain("Home");
    expect(rendered).toContain('aria-current="page"');
    expect(rendered).toContain("Import resume");
    expect(rendered).toContain("Create resume");
  });

  it.each([
    ["/import-resume", "/import-resume"],
    ["/import-resume/import-123/review", "/import-resume"],
    ["/resumes/new/manual", "/resumes/new/manual"],
  ])("identifies the current journey for %s", (currentPath, currentHref) => {
    pathname = currentPath;

    const rendered = renderToStaticMarkup(
      <AppShell localPlayMode={true}>
        <main>Page content</main>
      </AppShell>,
    );

    const container = document.createElement("div");
    container.innerHTML = rendered;
    const currentLinks = container.querySelectorAll('a[aria-current="page"]');

    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]?.getAttribute("href")).toBe(currentHref);
  });

  it("keeps owner access in the Community shell without development-mode copy", () => {
    const rendered = renderToStaticMarkup(
      <AppShell localPlayMode={false}>
        <main>Page content</main>
      </AppShell>,
    );

    expect(rendered).toContain("Checking sign-in…");
    expect(rendered).not.toContain("Local Play");
  });
});
