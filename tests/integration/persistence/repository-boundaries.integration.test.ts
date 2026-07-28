import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ImportedDocumentEntity,
  TypeOrmImportResumeRepository,
} from "@nuvitae/persistence";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import { createIsolatedPersistenceTestDatabase } from "./test-database.js";
import { ids, importedDocument } from "./fixtures.js";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return extname(path) === ".ts" || extname(path) === ".tsx" ? [path] : [];
    }),
  );
  return nested.flat();
}

function importsIn(source: string, filename: string): string[] {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  return file.statements.flatMap((statement) => {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return [statement.moduleSpecifier.text];
    }
    return [];
  });
}

describe("persistence ownership and architecture boundaries", () => {
  let database: IsolatedPersistenceTestDatabase;
  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("boundaries");
  });
  afterAll(async () => database.cleanup());

  it("returns domain values and makes wrong-owner indistinguishable from missing", async () => {
    const repository = new TypeOrmImportResumeRepository(database.dataSource);
    await repository.createImportAggregate({
      document: importedDocument(),
      artifacts: [],
    });
    const owned = await repository.findImportByOwner(ids.document, ids.ownerA);
    const wrongOwner = await repository.findImportByOwner(
      ids.document,
      ids.ownerB,
    );
    const missing = await repository.findImportByOwner(
      "20000000-0000-4000-8000-000000000099",
      ids.ownerB,
    );

    expect(owned?.document).not.toBeInstanceOf(ImportedDocumentEntity);
    expect(owned?.document).toMatchObject({
      id: ids.document,
      ownerUserId: ids.ownerA,
    });
    expect(wrongOwner).toBeNull();
    expect(missing).toBeNull();
    expect(repository.findImportByOwner.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps domain imports independent from TypeORM and persistence", async () => {
    const root = resolve(".");
    const files = await sourceFiles(join(root, "packages/domain/src"));
    const imports = (
      await Promise.all(
        files.map(async (file) =>
          importsIn(await readFile(file, "utf8"), file),
        ),
      )
    ).flat();
    expect(
      imports.filter(
        (specifier) =>
          specifier === "typeorm" ||
          specifier === "pg" ||
          specifier.startsWith("@nestjs/") ||
          specifier.includes("persistence"),
      ),
    ).toEqual([]);
  });

  it("keeps API and worker implementation modules out of persistence", async () => {
    const root = resolve(".");
    const files = await sourceFiles(join(root, "packages/persistence/src"));
    const imports = (
      await Promise.all(
        files.map(async (file) =>
          importsIn(await readFile(file, "utf8"), file),
        ),
      )
    ).flat();
    expect(
      imports.filter(
        (specifier) =>
          specifier.includes("apps/api") || specifier.includes("apps/worker"),
      ),
    ).toEqual([]);
  });

  it("keeps persistence query APIs out of controllers and processors", async () => {
    const root = resolve(".");
    const candidates = [
      ...(await sourceFiles(join(root, "apps/api/src"))),
      ...(await sourceFiles(join(root, "apps/worker/src"))),
    ].filter(
      (file) =>
        file.endsWith(".controller.ts") || file.endsWith(".processor.ts"),
    );
    const violations: string[] = [];
    for (const file of candidates) {
      const source = await readFile(file, "utf8");
      const imports = importsIn(source, file);
      if (
        imports.includes("typeorm") ||
        source.includes("createQueryBuilder(")
      ) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });
});
