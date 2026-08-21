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
});
