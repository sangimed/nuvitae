import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertT246LiveOperatorGate,
  isT246TestEnvironment,
  T246_OPERATOR_LIVE_OPT_IN,
} from "../lib/t246-live-guard.mjs";

test("T246 operator gate rejects live mode without explicit opt-in", () => {
  assert.throws(
    () => assertT246LiveOperatorGate({ mode: "live", env: {} }),
    (error) => error.code === "t246_live_operator_opt_in_required",
  );
});

test("T246 operator gate rejects test environments even with opt-in", () => {
  const env = {
    NODE_TEST_CONTEXT: "child",
    [T246_OPERATOR_LIVE_OPT_IN]: "1",
  };
  assert.equal(isT246TestEnvironment(env), true);
  assert.throws(
    () => assertT246LiveOperatorGate({ mode: "live", env }),
    (error) => error.code === "t246_live_operator_opt_in_forbidden_in_test",
  );
});

test("T246 preflight does not require the real-live opt-in", () => {
  assert.deepEqual(assertT246LiveOperatorGate({ mode: "preflight", env: {} }), {
    allowed: true,
    execution: "preflight",
  });
});

test("T246 dependency-injected simulated live mode is distinct from operator live mode", () => {
  assert.deepEqual(
    assertT246LiveOperatorGate({
      mode: "live",
      env: {},
      allowSimulatedLive: true,
    }),
    { allowed: true, execution: "simulated" },
  );
  assert.throws(
    () =>
      assertT246LiveOperatorGate({
        mode: "live",
        env: { NODE_ENV: "test" },
        allowSimulatedLive: true,
      }),
    (error) => error.code === "t246_live_operator_opt_in_forbidden_in_test",
  );
  assert.deepEqual(
    assertT246LiveOperatorGate({
      mode: "live",
      env: { [T246_OPERATOR_LIVE_OPT_IN]: "1" },
    }),
    { allowed: true, execution: "operator" },
  );
});
