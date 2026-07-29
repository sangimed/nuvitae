"use client";

import type { ConfirmedStructuredResumeReadResponse } from "@nuvitae/contracts";

export function StructuredResumeProvenance(props: {
  readonly resume: ConfirmedStructuredResumeReadResponse;
}) {
  return (
    <aside
      className="provenance-panel"
      aria-labelledby="resume-provenance-title"
    >
      <h2 id="resume-provenance-title">Resume provenance</h2>
      <ul>
        <li>Created from your reviewed initial resume</li>
        <li>Confirmed by you</li>
        {props.resume.sourceAvailability ===
        "source_available_until_retention_deadline" ? (
          <li>
            Original upload retained temporarily until{" "}
            {props.resume.sourceRetentionExpiresAt === undefined
              ? "the import deadline"
              : formatDate(props.resume.sourceRetentionExpiresAt)}
          </li>
        ) : props.resume.sourceAvailability === "source_no_longer_available" ? (
          <li>Original source no longer available</li>
        ) : (
          <li>Original upload remains separate from this structured resume</li>
        )}
      </ul>
    </aside>
  );
}

export function StructuredFieldProvenance(props: {
  readonly provenance: ConfirmedStructuredResumeReadResponse["content"]["personal"][number]["provenance"];
}) {
  switch (props.provenance.kind) {
    case "pdf":
      return (
        <span>Originally imported from page {props.provenance.pageNumber}</span>
      );
    case "docx":
      return <span>Originally imported from the document</span>;
    case "user_added":
      return <span>Added by you</span>;
    case "user_edited":
      return <span>Edited by you</span>;
    case "minimal":
      return <span>Created from your reviewed initial resume</span>;
    case "inferred":
      return <span>Confirmed by you</span>;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
