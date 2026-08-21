import {
  createManualDraftRequestSchema,
  manualDraftResponseSchema,
  updateManualDraftRequestSchema,
  type ManualDraftResponse,
  type StructuredResumeContentContract,
} from "@nuvitae/contracts";
import { apiPath } from "../api-config";

export type ManualDraftClientOutcome =
  | { readonly ok: true; readonly response: ManualDraftResponse }
  | {
      readonly ok: false;
      readonly category:
        | "authentication_required"
        | "not_found"
        | "validation_failed"
        | "stale_update"
        | "temporarily_unavailable";
      readonly message: string;
    };

export async function createManualDraft(input: {
  readonly creationKey: string;
  readonly signal?: AbortSignal | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<ManualDraftClientOutcome> {
  const parsed = createManualDraftRequestSchema.safeParse({
    creationKey: input.creationKey,
  });
  if (!parsed.success) {
    return {
      ok: false,
      category: "validation_failed",
      message: "Manual draft setup could not start safely.",
    };
  }
  return requestManualDraft({
    path: "/manual-resume-drafts",
    method: "POST",
    body: parsed.data,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
  });
}

export async function readManualDraft(input: {
  readonly draftId: string;
  readonly signal?: AbortSignal | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<ManualDraftClientOutcome> {
  return requestManualDraft({
    path: `/manual-resume-drafts/${input.draftId}`,
    method: "GET",
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
  });
}

export async function saveManualDraft(input: {
  readonly draftId: string;
  readonly expectedUpdatedAt: string;
  readonly content: StructuredResumeContentContract;
  readonly signal?: AbortSignal | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<ManualDraftClientOutcome> {
  const parsed = updateManualDraftRequestSchema.safeParse({
    expectedUpdatedAt: input.expectedUpdatedAt,
    content: input.content,
  });
  if (!parsed.success) {
    return {
      ok: false,
      category: "validation_failed",
      message: "Fix the highlighted fields before saving.",
    };
  }
  return requestManualDraft({
    path: `/manual-resume-drafts/${input.draftId}`,
    method: "PATCH",
    body: parsed.data,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
  });
}

async function requestManualDraft(input: {
  readonly path: string;
  readonly method: "GET" | "POST" | "PATCH";
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<ManualDraftClientOutcome> {
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const init: RequestInit = {
      method: input.method,
      credentials: "include",
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input.body),
          }),
    };
    const response = await fetcher(apiPath(input.path), init);
    if (!response.ok) return mapManualError(response.status);
    const parsed = manualDraftResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return {
        ok: false,
        category: "temporarily_unavailable",
        message: "The draft response could not be understood safely.",
      };
    }
    return { ok: true, response: parsed.data };
  } catch {
    return {
      ok: false,
      category: "temporarily_unavailable",
      message: "Manual resume drafts are temporarily unavailable.",
    };
  }
}

function mapManualError(status: number): ManualDraftClientOutcome {
  if (status === 401) {
    return {
      ok: false,
      category: "authentication_required",
      message: "Sign in before editing a manual resume draft.",
    };
  }
  if (status === 404) {
    return { ok: false, category: "not_found", message: "Draft not found." };
  }
  if (status === 409) {
    return {
      ok: false,
      category: "stale_update",
      message: "This draft changed in another tab. Reload before saving.",
    };
  }
  if (status === 400) {
    return {
      ok: false,
      category: "validation_failed",
      message: "Fix the highlighted fields before saving.",
    };
  }
  return {
    ok: false,
    category: "temporarily_unavailable",
    message: "Manual resume drafts are temporarily unavailable.",
  };
}
