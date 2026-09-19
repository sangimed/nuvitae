import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("initializes interpreted validation before contracts without probing Function", async () => {
  vi.resetModules();
  const generateCode = vi.fn(() => {
    throw new Error("Runtime code generation is forbidden");
  });
  vi.stubGlobal("Function", generateCode);
  await import("./instrumentation-client");
  const { manualSourcedTextSchema } = await import("@nuvitae/contracts");
  const text = {
    value: '<script>alert("not executable")</script>',
    sourceStatus: "user_added",
    confidenceStatus: "not_applicable",
    inferenceStatus: "not_inferred",
  };
  expect(manualSourcedTextSchema.parse(text)).toEqual(text);
  expect(
    manualSourcedTextSchema.safeParse({ ...text, ownerId: "injected" }).success,
  ).toBe(false);
  expect(
    manualSourcedTextSchema.safeParse({ ...text, value: "x".repeat(4_001) })
      .success,
  ).toBe(false);
  expect(generateCode).not.toHaveBeenCalled();
});
