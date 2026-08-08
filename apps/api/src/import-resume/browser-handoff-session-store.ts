import type {
  ProviderSessionStorageInput,
  ProviderSessionStore,
  ProviderSessionWriteInput,
} from "../services/import-resume/provider-connections.js";

/**
 * T213 deliberately has no credential persistence. T214/T215 will replace
 * this handoff-only port with the broker-backed session store when callback
 * completion and credential lifecycle are implemented.
 */
export const browserHandoffOnlySessionStore: ProviderSessionStore = {
  async writeSession(_input: ProviderSessionWriteInput) {
    throw new Error("provider_session_storage_unavailable");
  },
  async readSession(_input: ProviderSessionStorageInput) {
    throw new Error("provider_session_storage_unavailable");
  },
  async deleteSession(_input: ProviderSessionStorageInput) {
    throw new Error("provider_session_storage_unavailable");
  },
  async hasSession(_input: ProviderSessionStorageInput) {
    throw new Error("provider_session_storage_unavailable");
  },
};
