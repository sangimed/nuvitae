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

  it("shows Community owner guidance and deliberate first-use actions", () => {
    const rendered = renderToStaticMarkup(Home());

    expect(rendered).toContain("Nuvitae Community");
    expect(rendered).toContain("owner access secret");
    expect(rendered).toContain("scripts/community-owner-secret.sh");
    expect(rendered).toContain("Import an existing resume");
    expect(rendered).toContain("Create a resume manually");
    expect(rendered).toContain("Codex can be connected from the import flow");
    expect(rendered).not.toContain("Connect Codex");
  });
});
