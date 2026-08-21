import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
      "@nuvitae/import-application/codex": fileURLToPath(
        new URL(
          "./packages/import-application/src/providers/codex.ts",
          import.meta.url,
        ),
      ),
      "@nuvitae/import-application": fileURLToPath(
        new URL("./packages/import-application/src/index.ts", import.meta.url),
      ),
      "@nuvitae/persistence/ports": fileURLToPath(
        new URL("./packages/persistence/src/ports.ts", import.meta.url),
      ),
      "@nuvitae/persistence/typeorm": fileURLToPath(
        new URL("./packages/persistence/src/typeorm.ts", import.meta.url),
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
    include: ["tests/integration/persistence/**/*.integration.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
