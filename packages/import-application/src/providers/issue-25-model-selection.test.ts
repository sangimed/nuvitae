import { describe, expect, it, vi } from "vitest";
import {
  createIssue25BenchmarkTransport,
  invokeIssue25BenchmarkTransport,
  resolveIssue25BenchmarkModel,
  type Issue25BenchmarkAuthorization,
} from "./issue-25-model-selection.js";

const authorization = (
  model: unknown,
  state: Issue25BenchmarkAuthorization["state"] = "authorized",
): Issue25BenchmarkAuthorization => ({
  issue: 25,
  campaign: "import-resume-latency-confirmatory",
  authorizationId: "issue-25-test",
  arm: "A",
  state,
  model,
  reasoning: "low",
  verbosity: "low",
});

describe("Issue #25 benchmark model authorization", () => {
  it("binds Arm A to Sol and Arm B to Terra without provider calls", async () => {
    const sol = createIssue25BenchmarkTransport({
      authorization: authorization("gpt-5.6-sol"),
      model: "gpt-5.6-sol",
      fetch: vi.fn(),
    });
    const terra = createIssue25BenchmarkTransport({
      authorization: { ...authorization("gpt-5.6-terra"), arm: "B" },
      model: "gpt-5.6-terra",
      fetch: vi.fn(),
    });

    expect(sol.model).toBe("gpt-5.6-sol");
    expect(terra.model).toBe("gpt-5.6-terra");
  });

  it("fails before the provider invocation hook on an authorization mismatch", async () => {
    const invoke = vi.fn(async () => "should-not-run");

    await expect(
      invokeIssue25BenchmarkTransport({
        authorization: authorization("gpt-5.6-sol"),
        model: "gpt-5.6-terra",
        invoke,
      }),
    ).rejects.toMatchObject({ code: "conflicting_model_identifiers" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails closed when benchmark model selection is missing or unsupported", () => {
    expect(() =>
      resolveIssue25BenchmarkModel({
        authorization: authorization("gpt-5.6-sol"),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "missing_explicit_benchmark_model" }),
    );
    expect(() =>
      resolveIssue25BenchmarkModel({
        authorization: authorization("gpt-5.6-luna"),
        model: "gpt-5.6-luna",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "unsupported_model_identifier" }),
    );
  });

  it("does not execute consumed or not-authorized arms", () => {
    for (const state of ["consumed", "not_authorized"] as const) {
      expect(() =>
        createIssue25BenchmarkTransport({
          authorization: authorization("gpt-5.6-terra", state),
          model: "gpt-5.6-terra",
        }),
      ).toThrow("issue_25_benchmark_not_authorized");
    }
  });
});
