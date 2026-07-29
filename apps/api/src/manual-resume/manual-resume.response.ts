import {
  importResumeResponseSchemaVersion,
  manualDraftResponseSchema,
  type ManualDraftResponse,
} from "@nuvitae/contracts";
import type { ManualStructuredResumeDraft } from "@nuvitae/domain";

export function manualDraftResponse(input: {
  readonly requestId: string;
  readonly draft: ManualStructuredResumeDraft;
  readonly userMessage: string;
}): ManualDraftResponse {
  return manualDraftResponseSchema.parse({
    version: importResumeResponseSchemaVersion,
    requestId: input.requestId,
    status: "manual_draft",
    draft: {
      draftId: input.draft.id,
      source: input.draft.source,
      status: input.draft.status,
      content: input.draft.content,
      createdAt: input.draft.createdAt.toISOString(),
      updatedAt: input.draft.updatedAt.toISOString(),
    },
    userMessage: input.userMessage,
  });
}
