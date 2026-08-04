/**
 * T163 - provider-neutral connection service boundaries.
 *
 * Canonical implementation lives in `@nuvitae/import-application` so the
 * API service layer and future worker orchestration share one provider-
 * neutral service without importing provider adapters. No production provider
 * adapter is implemented here; callers inject the adapter port.
 */
export {
  ProviderConnectionError,
  ProviderConnectionService,
  providerConnectionErrorCodes,
  type ProviderAdapterConnectedResult,
  type ProviderAdapterInspection,
  type ProviderAdapterLoginResult,
  type ProviderAdapterQuotaResult,
  type ProviderConnectionErrorCode,
  type ProviderConnectionServicePorts,
  type ProviderConnectionStatusView,
  type ProviderRuntimeAdapterContext,
  type ProviderRuntimeConnectionAdapter,
  type ProviderSessionStorageInput,
  type ProviderSessionStore,
  type ProviderSessionWriteInput,
} from "@nuvitae/import-application";
