export function createT201BrokerExecutionState() {
  return {
    encryptedStateRecovered: false,
    credentialGenerationBefore: null,
    refreshRequired: false,
    refreshAttempted: false,
    refreshSucceeded: false,
    credentialGenerationAfter: null,
    invocationAttempted: false,
    invocationSucceeded: false,
    exactHttpStatus: null,
    responseProtocolValid: false,
  };
}

export function recordCredentialRecovery(
  state,
  generation,
  { after = false } = {},
) {
  state.encryptedStateRecovered = true;
  if (after) state.credentialGenerationAfter = generation;
  else state.credentialGenerationBefore = generation;
  return state;
}

export function recordRefreshRequired(state, refreshRequired) {
  state.refreshRequired = refreshRequired === true;
  return state;
}

export function recordRefreshAttempt(state) {
  state.refreshAttempted = true;
  return state;
}

export function recordRefreshResult(state, result) {
  state.refreshRequired = result.refresh_required === true;
  state.refreshAttempted = result.refresh_attempted === true;
  state.refreshSucceeded = result.refresh_succeeded === true;
  return state;
}

export function recordTransportResult(state, result) {
  state.invocationAttempted = result.invocation_attempted === true;
  state.invocationSucceeded = result.invocation_succeeded === true;
  state.exactHttpStatus = result.safe_exact_http_status ?? null;
  state.responseProtocolValid = result.response_protocol_valid === true;
  return state;
}

export function brokerStateEvidence(state) {
  return {
    encrypted_state_recovered: state.encryptedStateRecovered,
    credential_generation_before: state.credentialGenerationBefore,
    refresh_required: state.refreshRequired,
    refresh_attempted: state.refreshAttempted,
    refresh_succeeded: state.refreshSucceeded,
    credential_generation_after: state.credentialGenerationAfter,
    invocation_attempted: state.invocationAttempted,
    invocation_succeeded: state.invocationSucceeded,
    exact_http_status: state.exactHttpStatus,
    response_protocol_valid: state.responseProtocolValid,
  };
}
