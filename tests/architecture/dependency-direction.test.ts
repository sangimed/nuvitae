import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

interface ImportReference {
  readonly sourcePath: string;
  readonly specifier: string;
}

const importApplicationDebt = new Set<string>();

const forbiddenImportApplicationDependencies = new Set([
  "@nuvitae/persistence",
  "@nuvitae/storage",
  "@nestjs/bullmq",
  "@nestjs/common",
  "@nestjs/core",
  "@nestjs/typeorm",
  "bullmq",
  "typeorm",
]);

const importReadPathFiles = [
  "apps/api/src/import-resume/import-status.service.ts",
  "apps/api/src/import-resume/import-timing.controller.ts",
  "apps/api/src/services/import-resume/read-draft.ts",
].map((path) => join(repositoryRoot, path));
const importReviewMutationPath = join(
  repositoryRoot,
  "apps/api/src/services/import-resume/update-review.ts",
);
const importConfirmationPath = join(
  repositoryRoot,
  "apps/api/src/services/import-resume/confirm-structured-resume.ts",
);
const startImportPath = join(
  repositoryRoot,
  "apps/api/src/import-resume/start-import.service.ts",
);
const manualResumeMutationPaths = [
  "apps/api/src/manual-resume/create-manual-resume-draft.service.ts",
  "apps/api/src/manual-resume/update-manual-resume-draft.service.ts",
].map((path) => join(repositoryRoot, path));
const semanticWorkerPath = join(
  repositoryRoot,
  "apps/worker/src/import-resume/semantic-import.processor.ts",
);
const workerPersistencePath = join(
  repositoryRoot,
  "apps/worker/src/persistence/worker-persistence.module.ts",
);
const communityAuthServicePath = join(
  repositoryRoot,
  "apps/api/src/community-auth/community-auth.service.ts",
);
const apiSourceRoot = join(repositoryRoot, "apps/api/src");
const webFeatureRoot = join(repositoryRoot, "apps/web/src/features");
const semanticProviderRoot = join(
  repositoryRoot,
  "packages/import-application/src/providers",
);

function productionSourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const fullPath = join(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        visit(fullPath);
      } else if (
        /\.(ts|tsx)$/u.test(entry) &&
        !/\.(test|spec)\.(ts|tsx)$/u.test(entry)
      ) {
        files.push(fullPath);
      }
    }
  };
  visit(root);
  return files;
}

function sourceImports(sourcePath: string): ImportReference[] {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const references: ImportReference[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      references.push({ sourcePath, specifier: node.moduleSpecifier.text });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      references.push({ sourcePath, specifier: node.arguments[0].text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function packageImports(packageName: string): ImportReference[] {
  const sourceRoot = join(repositoryRoot, "packages", packageName, "src");
  return productionSourceFiles(sourceRoot).flatMap(sourceImports);
}

function display(reference: ImportReference): string {
  return `${relative(repositoryRoot, reference.sourcePath)} -> ${reference.specifier}`;
}

function resolveRelativeImport(reference: ImportReference): string | undefined {
  if (!reference.specifier.startsWith(".")) return undefined;
  const targetWithoutExtension = resolve(
    dirname(reference.sourcePath),
    reference.specifier.replace(/\.(js|mjs|cjs)$/u, ""),
  );
  for (const extension of [".ts", ".tsx", ".mts", ".cts"]) {
    if (existsSync(targetWithoutExtension + extension)) {
      return targetWithoutExtension + extension;
    }
  }
  return existsSync(targetWithoutExtension)
    ? targetWithoutExtension
    : undefined;
}

describe("architecture dependency direction", () => {
  it("keeps production domain code framework and infrastructure independent", () => {
    const forbidden = packageImports("domain")
      .filter(
        ({ specifier }) =>
          specifier.startsWith("@nuvitae/") ||
          specifier.startsWith("@nestjs/") ||
          specifier === "typeorm" ||
          specifier === "bullmq" ||
          specifier === "zod",
      )
      .map(display);

    expect(forbidden).toEqual([]);
  });

  it("keeps production contracts limited to contract-local code and Zod", () => {
    const contractsRoot = join(repositoryRoot, "packages", "contracts", "src");
    const forbidden = packageImports("contracts")
      .filter((reference) => {
        if (reference.specifier === "zod") return false;
        const target = resolveRelativeImport(reference);
        return target === undefined || !target.startsWith(contractsRoot);
      })
      .map(display);

    expect(forbidden).toEqual([]);
  });

  it("does not add application-to-infrastructure debt beyond the audited allowlist", () => {
    const violations = packageImports("import-application")
      .filter(({ specifier }) =>
        forbiddenImportApplicationDependencies.has(specifier),
      )
      .map(display)
      .sort();

    expect(violations).toEqual([...importApplicationDebt].sort());
  });

  it("keeps the debt allowlist exact so resolved violations are removed", () => {
    const existingFiles = new Set(
      productionSourceFiles(
        join(repositoryRoot, "packages", "import-application", "src"),
      ),
    );
    const staleEntries = [...importApplicationDebt].filter((entry) => {
      const source = entry.slice(0, entry.indexOf(" -> "));
      return !existingFiles.has(join(repositoryRoot, source));
    });

    expect(staleEntries).toEqual([]);
  });

  it("keeps import status, timing, and review reads behind the application-owned reader port", () => {
    const violations = importReadPathFiles
      .flatMap(sourceImports)
      .filter(
        ({ specifier }) =>
          specifier === "@nuvitae/persistence" || specifier === "typeorm",
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("keeps review mutation transaction details behind its application-owned repository", () => {
    const violations = sourceImports(importReviewMutationPath)
      .filter(
        ({ specifier }) =>
          specifier === "@nuvitae/persistence" || specifier === "typeorm",
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("keeps confirmation and discard transaction details behind their application-owned repository", () => {
    const violations = sourceImports(importConfirmationPath)
      .filter(
        ({ specifier }) =>
          specifier === "@nuvitae/persistence" || specifier === "typeorm",
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("keeps import creation transaction details behind its application-owned repository", () => {
    const violations = sourceImports(startImportPath)
      .filter(
        ({ specifier }) =>
          specifier === "@nuvitae/persistence" || specifier === "typeorm",
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("keeps manual resume transaction details behind its feature-owned repository", () => {
    const violations = manualResumeMutationPaths
      .flatMap(sourceImports)
      .filter(
        ({ specifier }) =>
          specifier === "@nuvitae/persistence" || specifier === "typeorm",
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("keeps semantic worker transaction details behind the import workflow repository", () => {
    const violations = sourceImports(semanticWorkerPath)
      .filter(
        ({ specifier }) =>
          specifier === "@nuvitae/persistence" || specifier === "typeorm",
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("does not reintroduce generic worker repository or transaction-runner tokens", () => {
    const source = readFileSync(workerPersistencePath, "utf8");

    expect(source).not.toContain("WORKER_IMPORT_RESUME_REPOSITORY");
    expect(source).not.toContain("WORKER_PERSISTENCE_TRANSACTION_RUNNER");
    expect(source).not.toContain("WORKER_PERSISTENCE_EXECUTION");
  });

  it("keeps production hosts off the persistence catch-all barrel", () => {
    const violations = ["api", "worker"]
      .flatMap((app) =>
        productionSourceFiles(join(repositoryRoot, "apps", app, "src")),
      )
      .flatMap(sourceImports)
      .filter(({ specifier }) => specifier === "@nuvitae/persistence")
      .map(display);

    expect(violations).toEqual([]);
  });

  it("keeps community authentication policy behind its feature-owned repository", () => {
    const violations = sourceImports(communityAuthServicePath)
      .filter(({ specifier }) => specifier.startsWith("@nuvitae/persistence"))
      .map(display);

    expect(violations).toEqual([]);
  });

  it("uses the shared identity/access guard rather than the historical import bridge", () => {
    const violations = productionSourceFiles(apiSourceRoot)
      .flatMap(sourceImports)
      .filter(({ specifier }) =>
        specifier.endsWith("import-resume/verified-principal.guard.js"),
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("keeps Nest import-resume consumers behind the feature-owned application facade", () => {
    const violations = productionSourceFiles(
      join(repositoryRoot, "apps/api/src/import-resume"),
    )
      .filter(
        (sourcePath) => !sourcePath.endsWith("/import-resume.application.ts"),
      )
      .flatMap(sourceImports)
      .filter(
        ({ specifier }) =>
          specifier.includes("../services/import-resume/read-draft") ||
          specifier.includes("../services/import-resume/update-review") ||
          specifier.includes(
            "../services/import-resume/confirm-structured-resume",
          ),
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("keeps web feature code behind feature-owned browser-client facades", () => {
    const violations = productionSourceFiles(webFeatureRoot)
      .filter((sourcePath) => !sourcePath.endsWith("/client.ts"))
      .flatMap(sourceImports)
      .filter(
        ({ specifier }) =>
          specifier.includes("services/import-resume/") ||
          specifier.includes("services/manual-resume/"),
      )
      .map(display);

    expect(violations).toEqual([]);
  });

  it("reserves semantic v1 for compatibility and prevents new provider writes", () => {
    const violations = productionSourceFiles(semanticProviderRoot)
      .filter((sourcePath) =>
        readFileSync(sourcePath, "utf8").includes("semantic-extraction.v1"),
      )
      .map((sourcePath) => relative(repositoryRoot, sourcePath));

    expect(violations).toEqual([]);
  });

  it("does not reintroduce the deprecated TypeORM-named limit-store surface", () => {
    const violations = ["api", "worker"]
      .flatMap((app) =>
        productionSourceFiles(join(repositoryRoot, "apps", app, "src")),
      )
      .flatMap(sourceImports)
      .filter(({ specifier }) =>
        specifier.includes("typeorm-import-limit-store"),
      )
      .map(display);

    expect(violations).toEqual([]);
  });
});
