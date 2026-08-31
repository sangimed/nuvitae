import type { ContextualResumeEditAction } from "@nuvitae/contracts";
import type { PrivacySafeSemanticProviderError } from "../semantic-parser/provider-errors.js";

export interface ContextualResumeEditProviderRequest {
  readonly action: ContextualResumeEditAction;
  readonly currentText: string;
}

export interface ContextualResumeEditProviderOptions {
  readonly ownerUserId: string;
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
}

export type ContextualResumeEditProviderResult =
  | { readonly ok: true; readonly proposedText: string }
  | { readonly ok: false; readonly error: PrivacySafeSemanticProviderError };

/** Provider-neutral application boundary for one bounded text proposal. */
export interface ContextualResumeEditProvider {
  readonly providerKind: string;
  propose(
    request: ContextualResumeEditProviderRequest,
    options: ContextualResumeEditProviderOptions,
  ): Promise<ContextualResumeEditProviderResult>;
}
