import {
  discardImportRequestSchema,
  discardImportResponseSchema,
  type DiscardImportRequest,
  type DiscardImportResponse,
} from "@nuvitae/contracts";
import { createBrowserUuid } from "../browser-ids";
import { importResumeApiPath } from "./config";

export type DraftLifecycleErrorCategory =
  | "authentication_required"
  | "not_found"
  | "stale_review"
  | "expired"
  | "lifecycle_not_discardable"
  | "temporarily_unavailable"
  | "malformed_response"
  | "unexpected_failure"
  | "cancelled";

export type DraftLifecycleOutcome<T> =
  | { readonly ok: true; readonly response: T }
  | {
      readonly ok: false;
      readonly category: DraftLifecycleErrorCategory;
      readonly message: string;
    };

export function createDiscardOperationId(): string {
  return createBrowserUuid();
}

export function createDiscardRequest(input: {
  readonly operationId: string;
  readonly expectedReviewRevision: number;
}): DiscardImportRequest {
  return discardImportRequestSchema.parse({
    ...input,
    explicitDiscard: true,
  });
}

export async function discardImportDraft(input: {
  readonly importId: string;
  readonly request: DiscardImportRequest;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<DraftLifecycleOutcome<DiscardImportResponse>> {
  const parsedRequest = discardImportRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    return {
      ok: false,
      category: "unexpected_failure",
      message: "The discard request could not be sent safely.",
    };
  }
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(
      importResumeApiPath(`/import-resume/${input.importId}/discard`),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsedRequest.data),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (!response.ok) return mapResponseError(response.status);
    const parsedResponse = discardImportResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsedResponse.success) {
      return {
        ok: false,
        category: "malformed_response",
        message: "The discard response could not be understood safely.",
      };
    }
    return { ok: true, response: parsedResponse.data };
  } catch (error) {
    return mapThrown(error);
  }
}

function mapResponseError<T>(status: number): DraftLifecycleOutcome<T> {
  if (status === 401) {
    return {
      ok: false,
      category: "authentication_required",
      message: "Sign in to discard this import.",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      category: "not_found",
      message: "This import is unavailable.",
    };
  }
  if (status === 409) {
    return {
      ok: false,
      category: "stale_review",
      message: "The review changed. Reload before discarding it.",
    };
  }
  if (status === 410) {
    return { ok: false, category: "expired", message: "This import expired." };
  }
  if (status === 503) {
    return {
      ok: false,
      category: "temporarily_unavailable",
      message: "Discard is temporarily unavailable.",
    };
  }
  return {
    ok: false,
    category: "unexpected_failure",
    message: "The discard request could not be completed safely.",
  };
}

function mapThrown<T>(error: unknown): DraftLifecycleOutcome<T> {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { ok: false, category: "cancelled", message: "Request stopped." };
  }
  return {
    ok: false,
    category: "temporarily_unavailable",
    message: "Connection temporarily lost.",
  };
}
