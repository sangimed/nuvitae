import { describe, expect, it } from "vitest";
import { createTypeOrmOptions } from "./typeorm-options";

describe("createTypeOrmOptions", () => {
  it("keeps schema synchronization disabled", () => {
    expect(
      createTypeOrmOptions({
        host: "postgres",
        port: 5432,
        username: "nuvitae",
        password: "example",
        database: "nuvitae",
        ssl: false,
      }).synchronize,
    ).toBe(false);
  });
});
