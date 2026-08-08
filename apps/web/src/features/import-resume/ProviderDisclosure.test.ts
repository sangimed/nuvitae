import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderDisclosure } from "./ProviderDisclosure";

describe("ProviderDisclosure (T175)", () => {
  it("explains provider requirement and provider use before provider-backed processing", async () => {
    const markup = renderToStaticMarkup(createElement(ProviderDisclosure));
    expect(markup).toContain("Codex to be connected");
    expect(markup).toContain("text extracted from your resume");
    expect(markup).toContain("unconfirmed until you review");
    expect(markup).toContain("backed by your document");
    expect(markup).toContain("limited automatic extraction");
    expect(markup).toContain("does not provide a reliable complete analysis");

    const uploadSource = await readFile(
      "apps/web/src/features/import-resume/UploadStep.tsx",
      "utf8",
    );
    const disclosureIndex = uploadSource.indexOf("ProviderDisclosure");
    const formIndex = uploadSource.indexOf("<form");
    expect(disclosureIndex).toBeGreaterThanOrEqual(0);
    expect(formIndex).toBeGreaterThan(disclosureIndex);
  });

  it("associates an accessible name with a plain-language heading", () => {
    const markup = renderToStaticMarkup(createElement(ProviderDisclosure));
    expect(markup).toContain('aria-labelledby="provider-disclosure-title"');
    expect(markup).toContain(
      '<h2 id="provider-disclosure-title">AI analysis of your resume</h2>',
    );
  });

  it("never exposes model, OAuth, credential, prompt, session, or raw diagnostic details", () => {
    const markup = renderToStaticMarkup(createElement(ProviderDisclosure));
    const forbidden = [
      "OAuth",
      "model",
      "credential",
      "token",
      "prompt",
      "session",
      "OpenAI",
      "endpoint",
      "config",
      "diagnostic",
      "storage",
      "api key",
      "capability",
      "JSON",
    ];
    for (const term of forbidden) {
      expect(markup.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});
