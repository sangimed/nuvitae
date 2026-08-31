import {
  contextualResumeEditProposalErrorResponseSchema,
  contextualResumeEditProposalResponseSchema,
  createContextualResumeEditProposalRequestSchema,
  type ContextualResumeEditAction,
  type ContextualResumeEditProposalResponse,
  type ContextualResumeEditTarget,
} from "@nuvitae/contracts";
import { apiPath } from "../api-config";

export type ContextualEditingClientOutcome =
  | {
      readonly ok: true;
      readonly response: ContextualResumeEditProposalResponse;
    }
  | { readonly ok: false; readonly message: string };

export async function createContextualResumeEditProposal(input: {
  readonly resumeId: string;
  readonly expectedUpdatedAt: string;
  readonly action: ContextualResumeEditAction;
  readonly target: ContextualResumeEditTarget;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<ContextualEditingClientOutcome> {
  const request = createContextualResumeEditProposalRequestSchema.safeParse({
    expectedUpdatedAt: input.expectedUpdatedAt,
    action: input.action,
    target: input.target,
  });
  if (!request.success) {
    return { ok: false, message: "The AI editing request was not valid." };
  }
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(
      apiPath(`/structured-resumes/${input.resumeId}/ai-edit-proposals`),
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.data),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    const body: unknown = await response.json();
    if (!response.ok) {
      const error =
        contextualResumeEditProposalErrorResponseSchema.safeParse(body);
      return {
        ok: false,
        message: error.success
          ? error.data.userMessage
          : "AI editing is temporarily unavailable. Your resume was not changed.",
      };
    }
    const proposal = contextualResumeEditProposalResponseSchema.safeParse(body);
    if (!proposal.success) {
      return {
        ok: false,
        message: "The AI proposal could not be understood safely.",
      };
    }
    return { ok: true, response: proposal.data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, message: "AI editing was cancelled." };
    }
    return {
      ok: false,
      message:
        "AI editing is temporarily unavailable. Your resume was not changed.",
    };
  }
}
