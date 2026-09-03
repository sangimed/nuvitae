"use client";

import { useState } from "react";
import type {
  ContextualResumeEditAction,
  ContextualResumeEditProposalResponse,
  ContextualResumeEditTarget,
} from "@nuvitae/contracts";

const actionLabels: Record<ContextualResumeEditAction, string> = {
  improve_writing: "Improve writing",
  make_concise: "Make concise",
  strengthen_impact: "Strengthen impact",
  fix_grammar: "Fix grammar",
};

export interface ContextualAiEditingControls {
  readonly state:
    | { readonly status: "idle" }
    | {
        readonly status: "generating";
        readonly target: ContextualResumeEditTarget;
      }
    | {
        readonly status: "error";
        readonly target: ContextualResumeEditTarget;
        readonly message: string;
      }
    | {
        readonly status: "proposal";
        readonly proposal: ContextualResumeEditProposalResponse;
      };
  readonly disabled: boolean;
  readonly request: (
    target: ContextualResumeEditTarget,
    action: ContextualResumeEditAction,
  ) => void;
  readonly accept: (proposal: ContextualResumeEditProposalResponse) => void;
  readonly reject: () => void;
}

export function ContextualAiEditControl(props: {
  readonly label: string;
  readonly target: ContextualResumeEditTarget;
  readonly controls: ContextualAiEditingControls;
}) {
  const [action, setAction] =
    useState<ContextualResumeEditAction>("improve_writing");
  const state = stateForTarget(props.controls.state, props.target);
  return (
    <div className="contextual-ai-edit">
      <div className="contextual-ai-actions">
        <label>
          <span className="visually-hidden">AI action for {props.label}</span>
          <select
            aria-label={`AI action for ${props.label}`}
            value={action}
            disabled={props.controls.disabled}
            onChange={(event) =>
              setAction(event.currentTarget.value as ContextualResumeEditAction)
            }
          >
            {Object.entries(actionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={props.controls.disabled}
          onClick={() => props.controls.request(props.target, action)}
        >
          {state?.status === "generating" ? "Generating…" : "Edit with AI"}
        </button>
      </div>
      {state?.status === "error" ? (
        <p className="message message-error" role="alert">
          {state.message}
        </p>
      ) : null}
      {state?.status === "proposal" ? (
        <section
          className="ai-proposal-review"
          aria-label={`AI proposal for ${props.label}`}
        >
          <p className="eyebrow">Review proposal</p>
          <div className="ai-proposal-comparison">
            <div>
              <h4>Before</h4>
              <p>{state.proposal.before}</p>
            </div>
            <div>
              <h4>After</h4>
              <p>{state.proposal.after}</p>
            </div>
          </div>
          <p className="ai-proposal-note">
            Nothing changes unless you accept. Save the resume separately to
            persist it.
          </p>
          <div className="action-row">
            <button
              className="primary-action"
              type="button"
              onClick={() => props.controls.accept(state.proposal)}
            >
              Accept proposal
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={props.controls.reject}
            >
              Reject proposal
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                props.controls.request(props.target, state.proposal.action)
              }
            >
              Regenerate
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function stateForTarget(
  state: ContextualAiEditingControls["state"],
  target: ContextualResumeEditTarget,
) {
  if (state.status === "idle") return null;
  const stateTarget =
    state.status === "proposal" ? state.proposal.target : state.target;
  return targetKey(stateTarget) === targetKey(target) ? state : null;
}

function targetKey(target: ContextualResumeEditTarget): string {
  if (target.kind === "summary") return target.kind;
  if (target.kind === "project_description")
    return `${target.kind}:${target.projectId}`;
  return `${target.kind}:${target.experienceId}:${target.roleId}:${target.itemIndex}`;
}
