import {
  reviewDraftReadResponseSchema,
  reviewMutationRequestSchema,
  reviewMutationResponseSchema,
  type ReviewDraftReadResponse,
  type ReviewMutationAction,
  type ReviewMutationRequest,
  type ReviewMutationResponse,
} from "@nuvitae/contracts";
import { createBrowserUuid } from "../browser-ids";
import { apiPath } from "../api-config";

export type ReviewClientErrorCategory =
  | "authentication_required"
  | "not_found"
  | "not_ready"
  | "stale_review"
  | "expired"
  | "rate_limited"
  | "temporarily_unavailable"
  | "malformed_response"
  | "unexpected_failure"
  | "cancelled";

export type ReviewClientOutcome<T> =
  | { readonly ok: true; readonly response: T }
  | {
      readonly ok: false;
      readonly category: ReviewClientErrorCategory;
      readonly message: string;
    };

export async function readReviewDraft(input: {
  readonly importId: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<ReviewClientOutcome<ReviewDraftReadResponse>> {
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(
      apiPath(`/import-resume/${input.importId}/review`),
      {
        method: "GET",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (!response.ok) return mapResponseError(response.status);
    const parsed = reviewDraftReadResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      return {
        ok: false,
        category: "malformed_response",
        message: "The review could not be loaded safely.",
      };
    }
    return { ok: true, response: parsed.data };
  } catch (error) {
    return mapThrown(error);
  }
}

export async function sendReviewMutation(input: {
  readonly importId: string;
  readonly request: ReviewMutationRequest;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<ReviewClientOutcome<ReviewMutationResponse>> {
  const parsedRequest = reviewMutationRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    return {
      ok: false,
      category: "unexpected_failure",
      message: "The review change could not be sent safely.",
    };
  }
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(
      apiPath(`/import-resume/${input.importId}/review`),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsedRequest.data),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (!response.ok) return mapResponseError(response.status);
    const parsedResponse = reviewMutationResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsedResponse.success) {
      return {
        ok: false,
        category: "malformed_response",
        message: "The review update could not be understood safely.",
      };
    }
    return { ok: true, response: parsedResponse.data };
  } catch (error) {
    return mapThrown(error);
  }
}

export function createReviewOperationId(): string {
  return createBrowserUuid();
}

export function createReviewMutationRequest(input: {
  readonly operationId: string;
  readonly expectedReviewRevision: number;
  readonly action: ReviewMutationAction;
}): ReviewMutationRequest {
  return reviewMutationRequestSchema.parse(input);
}

export function projectOptimisticReview(
  draft: ReviewDraftReadResponse,
  action: ReviewMutationAction,
): ReviewDraftReadResponse {
  const sections = draft.sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      if (
        (action.type === "confirm_field" ||
          action.type === "edit_field" ||
          action.type === "remove_field") &&
        field.fieldId === action.fieldId
      ) {
        if (action.type === "confirm_field") {
          return { ...field, reviewStatus: "confirmed" as const };
        }
        if (action.type === "edit_field") {
          return {
            ...field,
            value: action.value,
            sourceStatus: "user_edited" as const,
            confidenceStatus: "not_applicable" as const,
            inferenceStatus: "not_inferred" as const,
            reviewStatus: "edited" as const,
          };
        }
        return { ...field, reviewStatus: "excluded" as const };
      }
      return field;
    }),
    warnings: section.warnings.map((warning) => {
      if (
        action.type === "resolve_warning" &&
        warning.warningId === action.warningId
      ) {
        return { ...warning, reviewStatus: action.resolution };
      }
      if (
        action.type === "exclude_section" &&
        warning.reviewStatus === "needs_review"
      ) {
        return { ...warning, reviewStatus: "excluded" as const };
      }
      return warning;
    }),
  }));
  return { ...draft, sections };
}

function mapResponseError<T>(status: number): ReviewClientOutcome<T> {
  if (status === 401) {
    return {
      ok: false,
      category: "authentication_required",
      message: "Sign in to review this imported resume.",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      category: "not_found",
      message: "This import is unavailable or no longer accessible.",
    };
  }
  if (status === 409) {
    return {
      ok: false,
      category: "stale_review",
      message: "The review changed. Refreshing the current version.",
    };
  }
  if (status === 410) {
    return {
      ok: false,
      category: "expired",
      message: "This import has expired.",
    };
  }
  if (status === 429) {
    return {
      ok: false,
      category: "rate_limited",
      message: "Too many review actions were sent. Wait and try again.",
    };
  }
  if (status === 503) {
    return {
      ok: false,
      category: "temporarily_unavailable",
      message: "Review is temporarily unavailable.",
    };
  }
  return {
    ok: false,
    category: "unexpected_failure",
    message: "The review request could not be completed safely.",
  };
}

function mapThrown<T>(error: unknown): ReviewClientOutcome<T> {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      ok: false,
      category: "cancelled",
      message: "Review loading was stopped.",
    };
  }
  return {
    ok: false,
    category: "temporarily_unavailable",
    message: "Connection temporarily lost.",
  };
}
