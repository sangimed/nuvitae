// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  contextualResumeEditActions,
  type ContextualResumeEditProposalResponse,
} from "@nuvitae/contracts";
import { ContextualAiEditControl } from "./ContextualAiEditControl";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ContextualAiEditControl", () => {
  it("offers exactly four initial actions near the affected content", async () => {
    await act(async () => {
      root.render(
        <ContextualAiEditControl
          label="professional summary"
          target={{ kind: "summary" }}
          controls={{
            state: { status: "idle" },
            disabled: false,
            request: vi.fn(),
            accept: vi.fn(),
            reject: vi.fn(),
          }}
        />,
      );
    });

    expect(contextualResumeEditActions).toHaveLength(4);
    expect(container.querySelectorAll("option")).toHaveLength(4);
    expect(container.textContent).toContain("Edit with AI");
  });

  it("shows before/after and exposes explicit accept, reject, and regenerate actions", async () => {
    const accept = vi.fn();
    const reject = vi.fn();
    const request = vi.fn();
    const proposal = fixtureProposal();
    await act(async () => {
      root.render(
        <ContextualAiEditControl
          label="professional summary"
          target={{ kind: "summary" }}
          controls={{
            state: { status: "proposal", proposal },
            disabled: false,
            request,
            accept,
            reject,
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Before");
    expect(container.textContent).toContain(proposal.before);
    expect(container.textContent).toContain("After");
    expect(container.textContent).toContain(proposal.after);
    const button = (name: string) =>
      [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === name,
      )!;
    await act(async () => button("Accept proposal").click());
    expect(accept).toHaveBeenCalledWith(proposal);
    await act(async () => button("Reject proposal").click());
    expect(reject).toHaveBeenCalledOnce();
    await act(async () => button("Regenerate").click());
    expect(request).toHaveBeenCalledWith({ kind: "summary" }, "make_concise");
  });
});

function fixtureProposal(): ContextualResumeEditProposalResponse {
  return {
    version: "2026-07-28",
    requestId: "10000000-0000-4000-8000-000000000001",
    status: "contextual_resume_edit_proposal",
    proposalId: "20000000-0000-4000-8000-000000000001",
    action: "make_concise",
    target: { kind: "summary" },
    before: "Was responsible for managing reliability.",
    after: "Managed reliability.",
    generatedAt: "2026-08-31T12:00:00.000Z",
    userMessage: "Review the proposal before accepting it.",
  };
}
