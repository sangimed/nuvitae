// Independent T246 live-execution boundary.
//
// Authorization proves which attempt is eligible. This gate proves that an
// operator deliberately selected real live execution. The value is an
// explicit, non-secret acknowledgement; it is not a credential and must not
// be persisted in the registry or evidence.
export const T246_OPERATOR_LIVE_OPT_IN = "NUVITAE_T246_OPERATOR_LIVE_OPT_IN";
export const T246_OPERATOR_LIVE_OPT_IN_VALUE = "1";

function guardError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function isT246TestEnvironment(env = process.env) {
  return (
    env.NODE_ENV === "test" ||
    env.NODE_TEST_CONTEXT !== undefined ||
    env.VITEST !== undefined ||
    env.JEST_WORKER_ID !== undefined ||
    env.NUVITAE_T246_TEST_MODE === "1"
  );
}

export function assertT246LiveOperatorGate({
  mode,
  env = process.env,
  allowSimulatedLive = false,
} = {}) {
  if (mode !== "live") return { allowed: true, execution: "preflight" };
  if (isT246TestEnvironment(env)) {
    throw guardError("t246_live_operator_opt_in_forbidden_in_test");
  }
  if (allowSimulatedLive) {
    return { allowed: true, execution: "simulated" };
  }
  if (env[T246_OPERATOR_LIVE_OPT_IN] !== T246_OPERATOR_LIVE_OPT_IN_VALUE) {
    throw guardError("t246_live_operator_opt_in_required");
  }
  return { allowed: true, execution: "operator" };
}
