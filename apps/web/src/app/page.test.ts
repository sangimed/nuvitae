import { describe, expect, it } from "vitest";
import { bootstrapHealthSchema } from "@nuvitae/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "./page";

describe("web bootstrap contract", () => {
  it("accepts the web liveness payload", () => {
    expect(
      bootstrapHealthSchema.parse({
        service: "web",
        status: "ok",
      }),
    ).toEqual({
      service: "web",
      status: "ok",
    });
  });

  it("shows a clear first-resume choice without developer guidance", () => {
    const rendered = renderToStaticMarkup(Home());

    expect(rendered).toContain("Import your existing resume");
    expect(rendered).toContain("Create a resume from scratch");
    expect(rendered).toContain("Sign in from the header");
    expect(rendered).toContain("Your resume is kept private");
    expect(rendered).not.toContain("Connect Codex");
    expect(rendered).not.toContain("owner access secret");
    expect(rendered).not.toContain("scripts/community-owner-secret.sh");
    expect(rendered).not.toContain("Local Play");
    expect(rendered).not.toContain("API route");
    expect(rendered).not.toContain("Web</dt>");
  });
});
