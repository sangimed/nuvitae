import { describe, expect, it, vi } from "vitest";
import { createContextualResumeEditProposal } from "./contextual-editing-client";

describe("createContextualResumeEditProposal", () => {
  it("sends only the target/action/version guard and accepts a valid proposal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          version: "2026-07-28",
          requestId: "10000000-0000-4000-8000-000000000001",
          status: "contextual_resume_edit_proposal",
          proposalId: "20000000-0000-4000-8000-000000000001",
          action: "fix_grammar",
          target: { kind: "summary" },
          before: "Managed platform reliability",
          after: "Managed platform reliability.",
          generatedAt: "2026-08-31T12:00:00.000Z",
          userMessage: "Review the proposal before accepting it.",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const outcome = await createContextualResumeEditProposal({
      resumeId: "30000000-0000-4000-8000-000000000001",
      expectedUpdatedAt: "2026-08-31T11:00:00.000Z",
      action: "fix_grammar",
      target: { kind: "summary" },
      fetchImpl,
    });

    expect(outcome.ok).toBe(true);
    const options = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      expectedUpdatedAt: "2026-08-31T11:00:00.000Z",
      action: "fix_grammar",
      target: { kind: "summary" },
    });
  });
});
