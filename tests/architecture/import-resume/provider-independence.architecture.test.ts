import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Vitest runs from the repository root, which is also the vitest/tsconfig
// config root. Keep path derivation free of import.meta so this file typechecks
// under the CommonJS root tsconfig while still running under vitest's ESM.
const repositoryRoot = process.cwd();

const domainRoot = join(repositoryRoot, "packages", "domain", "src");
const applicationRoot = join(
  repositoryRoot,
  "packages",
  "import-application",
  "src",
);
const workerRoot = join(repositoryRoot, "apps", "worker", "src");

const testingProviderDirectory = join(applicationRoot, "providers", "testing");
// T216's one production provider adapter is the intentional provider-specific
// edge. It remains behind ResumeSemanticParserProvider and is excluded from
// the provider-neutral application scan; domain and worker orchestration still
// cannot import provider-native code directly.
const productionCodexAdapterFiles = new Set([
  join(applicationRoot, "providers", "codex-direct-provider-adapter.ts"),
  join(applicationRoot, "providers", "codex-direct-transport.ts"),
  join(applicationRoot, "providers", "codex-session.ts"),
]);
const productionCodexAdapterExports = new Set([
  "./providers/codex-direct-provider-adapter.js",
  "./providers/codex-direct-transport.js",
  "./providers/codex-session.js",
]);

const e2eWorkerModule = join(workerRoot, "worker-e2e.module.ts");
const e2eWorkerProviders = join(
  workerRoot,
  "import-resume",
  "worker-e2e-import-runtime.providers.ts",
);
const workerRuntime = join(workerRoot, "runtime", "worker-runtime.ts");
const productionWorkerModule = join(workerRoot, "worker.module.ts");
const productionWorkerProviders = join(
  workerRoot,
  "import-resume",
  "worker-import-runtime.providers.ts",
);

const providerSpecificPattern =
  /codex|openai|chatgpt|anthropic|claude|ollama/iu;
const testingProviderSpecifier = "@nuvitae/import-application/testing";

interface ImportReference {
  readonly specifier: string;
  readonly kind: "static" | "dynamic";
}

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const fullPath = join(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        visit(fullPath);
      } else if (/\.(ts|tsx)$/u.test(entry)) {
        files.push(fullPath);
      }
    }
  };
  visit(root);
  return files;
}

function collectImportReferences(sourcePath: string): ImportReference[] {
  const source = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const references: ImportReference[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node)
    ) {
      let specifier: string | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          specifier = node.moduleSpecifier.text;
        }
      } else if (ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        if (ts.isStringLiteral(expression)) {
          specifier = expression.text;
        }
      }
      if (specifier !== undefined) {
        references.push({ specifier, kind: "static" });
      }
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "import")) &&
      node.arguments.length === 1 &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      references.push({
        specifier: node.arguments[0].text,
        kind: "dynamic",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function resolveSourceTarget(
  sourcePath: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const withoutExtension = specifier.replace(/\.(js|mjs|cjs)$/u, "");
  const resolved = resolve(dirname(sourcePath), withoutExtension);
  for (const extension of [".ts", ".tsx", ".mts", ".cts"]) {
    if (existsSync(resolved + extension)) return resolved + extension;
  }
  return existsSync(resolved) ? resolved : undefined;
}

function forbiddenReason(
  reference: ImportReference,
  sourcePath: string,
): string | undefined {
  const { specifier } = reference;
  if (
    sourcePath === join(applicationRoot, "index.ts") &&
    productionCodexAdapterExports.has(specifier)
  ) {
    return undefined;
  }
  if (providerSpecificPattern.test(specifier)) {
    return `provider-specific import "${specifier}"`;
  }
  if (specifier === testingProviderSpecifier) {
    return `T210 testing provider import "${specifier}"`;
  }
  if (specifier.includes("providers/testing")) {
    return `testing provider relative import "${specifier}"`;
  }
  const target = resolveSourceTarget(sourcePath, specifier);
  if (target !== undefined) {
    const normalizedTarget = target.split(sep).join("/");
    const normalizedSpikes = `${sep}spikes${sep}`.split(sep).join("/");
    if (normalizedTarget.includes(normalizedSpikes)) {
      return `direct-OAuth spike code import "${specifier}"`;
    }
    if (target.startsWith(testingProviderDirectory)) {
      return `T210 testing provider relative import "${specifier}"`;
    }
  }
  return undefined;
}

function productionWorkerFiles(): string[] {
  return collectSourceFiles(workerRoot).filter(
    (file) =>
      !file.endsWith(".test.ts") &&
      !file.endsWith(".test.tsx") &&
      file !== e2eWorkerModule &&
      file !== e2eWorkerProviders &&
      file !== workerRuntime,
  );
}

function productionApplicationFiles(): string[] {
  return collectSourceFiles(applicationRoot).filter(
    (file) =>
      !file.endsWith(".test.ts") &&
      !file.startsWith(testingProviderDirectory) &&
      !productionCodexAdapterFiles.has(file),
  );
}

function productionDomainFiles(): string[] {
  return collectSourceFiles(domainRoot).filter(
    (file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
  );
}

describe("provider independence architecture boundary", () => {
  it("keeps production domain code free of provider, SDK, spike, and testing-provider imports", () => {
    const violations: string[] = [];
    for (const file of productionDomainFiles()) {
      for (const reference of collectImportReferences(file)) {
        const reason = forbiddenReason(reference, file);
        if (reason !== undefined) {
          violations.push(`${relative(repositoryRoot, file)}: ${reason}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps production import-application code free of provider, SDK, spike, and testing-provider imports", () => {
    const violations: string[] = [];
    for (const file of productionApplicationFiles()) {
      for (const reference of collectImportReferences(file)) {
        const reason = forbiddenReason(reference, file);
        if (reason !== undefined) {
          violations.push(`${relative(repositoryRoot, file)}: ${reason}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps production worker code free of provider, SDK, spike, and testing-provider imports", () => {
    const violations: string[] = [];
    for (const file of productionWorkerFiles()) {
      for (const reference of collectImportReferences(file)) {
        const reason = forbiddenReason(reference, file);
        if (reason !== undefined) {
          violations.push(`${relative(repositoryRoot, file)}: ${reason}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the worker runtime production composition free of E2E and testing-provider references", () => {
    for (const file of [productionWorkerModule, productionWorkerProviders]) {
      const references = collectImportReferences(file);
      const forbidden = references.filter((reference) => {
        const resolved = resolveSourceTarget(file, reference.specifier);
        return (
          reference.specifier.includes("worker-e2e") ||
          reference.specifier === testingProviderSpecifier ||
          reference.specifier.includes("providers/testing") ||
          (resolved !== undefined &&
            resolved.startsWith(testingProviderDirectory))
        );
      });
      expect(
        forbidden,
        `${relative(repositoryRoot, file)} must not reference E2E or testing providers`,
      ).toEqual([]);
    }
  });

  it("routes the explicit E2E-only testing registration only through the dedicated E2E module and runtime gate", () => {
    expect(existsSync(e2eWorkerModule)).toBe(true);
    expect(existsSync(e2eWorkerProviders)).toBe(true);
    expect(existsSync(workerRuntime)).toBe(true);

    const e2eProvidersReferences = collectImportReferences(e2eWorkerProviders);
    expect(
      e2eProvidersReferences.some(
        (reference) => reference.specifier === testingProviderSpecifier,
      ),
    ).toBe(true);

    const e2eModuleReferences = collectImportReferences(e2eWorkerModule);
    expect(
      e2eModuleReferences.some((reference) =>
        reference.specifier.includes("worker-e2e-import-runtime.providers"),
      ),
    ).toBe(true);

    const runtimeReferences = collectImportReferences(workerRuntime);
    const runtimeE2EReferences = runtimeReferences.filter((reference) => {
      const target = resolveSourceTarget(workerRuntime, reference.specifier);
      return (
        reference.specifier.includes("worker-e2e") ||
        (target !== undefined && target === e2eWorkerModule)
      );
    });
    expect(runtimeE2EReferences.length).toBe(1);
    expect(runtimeE2EReferences[0]?.kind).toBe("dynamic");
    expect(runtimeE2EReferences[0]?.specifier).toContain("worker-e2e.module");

    const runtimeTestingReferences = runtimeReferences.filter(
      (reference) =>
        reference.specifier === testingProviderSpecifier ||
        reference.specifier.includes("providers/testing"),
    );
    expect(runtimeTestingReferences).toEqual([]);

    const workerSource = readFileSync(workerRuntime, "utf8");
    expect(workerSource).toContain("deterministic-e2e-test");
  });

  it("keeps the T210 testing provider out of every non-E2E worker reference path", () => {
    const workerFiles = collectSourceFiles(workerRoot).filter(
      (file) =>
        file !== e2eWorkerModule &&
        file !== e2eWorkerProviders &&
        !file.endsWith(".test.ts") &&
        !file.endsWith(".test.tsx"),
    );
    for (const file of workerFiles) {
      for (const reference of collectImportReferences(file)) {
        const target = resolveSourceTarget(file, reference.specifier);
        const resolvesToTestingProvider =
          target !== undefined && target.startsWith(testingProviderDirectory);
        expect(
          resolvesToTestingProvider ||
            reference.specifier !== testingProviderSpecifier,
          `${relative(repositoryRoot, file)} must not depend on the T210 testing provider`,
        ).toBe(true);
      }
    }
  });
});
