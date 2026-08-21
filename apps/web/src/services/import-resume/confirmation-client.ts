import {
  confirmedStructuredResumeReadResponseSchema,
  confirmStructuredResumeRequestSchema,
  confirmStructuredResumeResponseSchema,
  type ConfirmStructuredResumeRequest,
  type ConfirmStructuredResumeResponse,
  type ConfirmedStructuredResumeReadResponse,
} from "@nuvitae/contracts";
import { createBrowserUuid } from "../browser-ids";
import { apiPath } from "../api-config";

export type ConfirmationClientErrorCategory =
  | "authentication_required"
  | "not_found"
  | "draft_not_ready"
  | "unresolved_warnings"
  | "no_user_confirmed_field"
  | "reviewed_content_not_mappable"
  | "stale_review"
  | "expired"
  | "concurrent_confirmation"
  | "temporarily_unavailable"
  | "malformed_response"
  | "unexpected_failure"
  | "cancelled";

export type ConfirmationClientOutcome<T> =
  | { readonly ok: true; readonly response: T }
  | {
      readonly ok: false;
      readonly category: ConfirmationClientErrorCategory;
      readonly message: string;
    };

export function createConfirmationOperationId(): string {
  return createBrowserUuid();
}

export function createConfirmationRequest(input: {
  readonly operationId: string;
  readonly expectedReviewRevision: number;
}): ConfirmStructuredResumeRequest {
  return confirmStructuredResumeRequestSchema.parse({
    ...input,
    explicitConfirmation: true,
  });
}

export async function confirmStructuredResume(input: {
  readonly importId: string;
  readonly request: ConfirmStructuredResumeRequest;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<ConfirmationClientOutcome<ConfirmStructuredResumeResponse>> {
  const parsedRequest = confirmStructuredResumeRequestSchema.safeParse(
    input.request,
  );
  if (!parsedRequest.success) {
    return {
      ok: false,
      category: "unexpected_failure",
      message: "The confirmation could not be sent safely.",
    };
  }
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(
      apiPath(`/import-resume/${input.importId}/confirm`),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsedRequest.data),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (!response.ok) return mapResponseError(response.status);
    const parsedResponse = confirmStructuredResumeResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsedResponse.success) return malformed();
    return { ok: true, response: parsedResponse.data };
  } catch (error) {
    return mapThrown(error);
  }
}

export async function readConfirmedStructuredResume(input: {
  readonly resumeId: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<ConfirmationClientOutcome<ConfirmedStructuredResumeReadResponse>> {
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(
      apiPath(`/structured-resumes/${input.resumeId}`),
      {
        method: "GET",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (!response.ok) return mapResponseError(response.status);
    const parsed = confirmedStructuredResumeReadResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) return malformed();
    return { ok: true, response: parsed.data };
  } catch (error) {
    return mapThrown(error);
  }
}

function malformed<T>(): ConfirmationClientOutcome<T> {
  return {
    ok: false,
    category: "malformed_response",
    message: "The response could not be understood safely.",
  };
}

function mapResponseError<T>(status: number): ConfirmationClientOutcome<T> {
  if (status === 401) {
    return {
      ok: false,
      category: "authentication_required",
      message: "Sign in to create this structured resume.",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      category: "not_found",
      message: "This import or resume is unavailable.",
    };
  }
  if (status === 409) {
    return {
      ok: false,
      category: "stale_review",
      message: "The review changed. Reloading the current version.",
    };
  }
  if (status === 410) {
    return { ok: false, category: "expired", message: "This import expired." };
  }
  if (status === 422) {
    return {
      ok: false,
      category: "reviewed_content_not_mappable",
      message:
        "The reviewed content cannot be safely converted yet. Review the remaining items.",
    };
  }
  if (status === 503) {
    return {
      ok: false,
      category: "temporarily_unavailable",
      message: "Resume creation is temporarily unavailable.",
    };
  }
  return {
    ok: false,
    category: "unexpected_failure",
    message: "The request could not be completed safely.",
  };
}

function mapThrown<T>(error: unknown): ConfirmationClientOutcome<T> {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { ok: false, category: "cancelled", message: "Request stopped." };
  }
  return {
    ok: false,
    category: "temporarily_unavailable",
    message: "Connection temporarily lost.",
  };
}
