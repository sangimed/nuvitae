import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const packageJson = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
) as { scripts?: Record<string, string> };
const workflow = readFileSync(
  join(repositoryRoot, ".github/workflows/quality.yml"),
  "utf8",
);

const validationCommands = [
  "pnpm lint",
  "pnpm format:check",
  "pnpm typecheck",
  "pnpm test",
  "pnpm build",
] as const;

describe("repository quality gates", () => {
  it("exposes every canonical local quality command", () => {
    expect(packageJson.scripts).toMatchObject({
      lint: "eslint .",
      "lint:fix": "eslint . --fix",
      format: "prettier --write --ignore-unknown .",
      "format:check": "prettier --check --ignore-unknown .",
      typecheck: expect.any(String),
      test: expect.any(String),
      build: expect.any(String),
    });
  });

  it("runs every validation command in CI without auto-fixing", () => {
    for (const command of validationCommands) {
      expect(workflow).toContain(`command: ${command}`);
    }

    expect(workflow).not.toContain("pnpm lint:fix");
    expect(workflow).not.toMatch(/command: pnpm format(?:\s|$)/u);
  });
});
