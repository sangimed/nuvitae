import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const readRepositoryFile = (path: string): string =>
  readFileSync(join(repositoryRoot, path), "utf8");

const securityWorkflow = readRepositoryFile(
  ".github/workflows/security-analysis.yml",
);
const containerWorkflow = readRepositoryFile(
  ".github/workflows/container-security.yml",
);
const qualityWorkflow = readRepositoryFile(".github/workflows/quality.yml");
const dependabot = readRepositoryFile(".github/dependabot.yml");
const gitleaks = readRepositoryFile(".gitleaks.toml");
const gitleaksIgnore = readRepositoryFile(".gitleaksignore");

describe("security automation contracts", () => {
  it("keeps untrusted pull-request analysis read-only and secret-free", () => {
    expect(securityWorkflow).toContain("pull_request:");
    expect(securityWorkflow).not.toContain("pull_request_target:");
    expect(securityWorkflow).not.toContain("secrets.");
    expect(securityWorkflow).toMatch(/permissions:\n  contents: read/u);
    expect(securityWorkflow).toContain('GITLEAKS_ENABLE_COMMENTS: "false"');
  });

  it("loads default secret rules and detects the harmless fail-test marker", () => {
    expect(gitleaks).toContain("useDefault = true");
    const markerRule = /NUVITAE_GITLEAKS_TEST_MARKER=\[A-Z0-9\]\{16\}/u;
    expect(gitleaks).toMatch(markerRule);
    const harmlessMarker = [
      "NUVITAE_GITLEAKS_TEST_MARKER",
      "0123456789ABCDEF",
    ].join("=");
    expect(harmlessMarker).toMatch(
      /NUVITAE_GITLEAKS_TEST_MARKER=[A-Z0-9]{16}/u,
    );
    const ignoredFingerprints = gitleaksIgnore
      .split("\n")
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(ignoredFingerprints).toHaveLength(12);
    for (const fingerprint of ignoredFingerprints) {
      expect(fingerprint).toMatch(
        /^[0-9a-f]{40}:[^:]+:generic-api-key:\d+$/u,
      );
    }
  });

  it("runs precise JavaScript and TypeScript CodeQL analysis", () => {
    expect(securityWorkflow).toContain("security-events: write");
    expect(securityWorkflow).toContain("languages: javascript-typescript");
    expect(securityWorkflow).toContain("build-mode: none");
  });

  it("blocks high and critical findings across the real container surface", () => {
    for (const service of ["web", "api", "worker"]) {
      expect(containerWorkflow).toContain(`service: ${service}`);
      expect(containerWorkflow).toContain(`nuvitae-${service}:0.1.0`);
    }
    for (const topology of [
      "-f compose.yml",
      "-f compose.yml -f compose.dev.yml",
      "-f compose.yml -f compose.local.yml",
      "-f compose.yml -f .github/compose.quality.yml",
    ]) {
      expect(containerWorkflow).toContain(`files: ${topology}`);
    }
    expect(containerWorkflow).toContain("scan-ref: docker");
    expect(containerWorkflow).toContain("config --quiet");
    expect(containerWorkflow.match(/severity: HIGH,CRITICAL/gu)).toHaveLength(2);
    expect(containerWorkflow.match(/exit-code: "1"/gu)).toHaveLength(2);
  });

  it("extends the canonical quality pipeline with a blocking dependency audit", () => {
    expect(qualityWorkflow).toContain("name: Dependency vulnerabilities");
    expect(qualityWorkflow).toContain(
      "command: pnpm audit --prod --audit-level high",
    );
    expect(qualityWorkflow).not.toContain("warn-only");
  });

  it("requests reviewed weekly dependency updates without auto-merge", () => {
    expect(dependabot.match(/interval: weekly/gu)).toHaveLength(2);
    expect(dependabot).toContain("timezone: Europe/Paris");
    expect(dependabot).toContain("- sangimed");
    expect(dependabot).not.toMatch(/auto-merge|automerge/iu);
  });
});
