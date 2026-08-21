import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: false,
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@nuvitae/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@nuvitae/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url),
      ),
      "@nuvitae/extraction": fileURLToPath(
        new URL("./packages/extraction/src/index.ts", import.meta.url),
      ),
      "@nuvitae/import-application/testing": fileURLToPath(
        new URL(
          "./packages/import-application/src/providers/testing/index.ts",
          import.meta.url,
        ),
      ),
      "@nuvitae/import-application/codex": fileURLToPath(
        new URL(
          "./packages/import-application/src/providers/codex.ts",
          import.meta.url,
        ),
      ),
      "@nuvitae/import-application": fileURLToPath(
        new URL("./packages/import-application/src/index.ts", import.meta.url),
      ),
      "@nuvitae/persistence": fileURLToPath(
        new URL("./packages/persistence/src/index.ts", import.meta.url),
      ),
      "@nuvitae/storage": fileURLToPath(
        new URL("./packages/storage/src/index.ts", import.meta.url),
      ),
      "@nuvitae/test-fixtures": fileURLToPath(
        new URL("./packages/test-fixtures/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "tests/architecture/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/integration/import-resume/**/*.test.ts",
      "tests/security/**/*.test.ts",
    ],
    environment: "node",
  },
});
