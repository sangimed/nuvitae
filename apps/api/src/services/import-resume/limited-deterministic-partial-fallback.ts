/**
 * T188 - limited deterministic partial extraction fallback orchestration.
 *
 * Canonical implementation lives in `@nuvitae/import-application` so the API
 * service layer and future worker orchestration share one deterministic,
 * provider-neutral fallback without importing provider adapters. This module
 * preserves the exact API task path as the entry point.
 */
export {
  limitedDeterministicFallbackProviderTriggers,
  runLimitedDeterministicPartialFallback,
  type LimitedDeterministicFallbackProviderTrigger,
  type LimitedDeterministicPartialFallbackInput,
} from "@nuvitae/import-application";
