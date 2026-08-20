"use client";

import type { ReviewField } from "@nuvitae/contracts";

export function FieldProvenance(props: {
  readonly provenance: ReviewField["provenance"];
  readonly inferenceStatus: ReviewField["inferenceStatus"];
}) {
  return (
    <span className="field-provenance">
      {label(props.provenance, props.inferenceStatus)}
    </span>
  );
}

function label(
  provenance: ReviewField["provenance"],
  inferenceStatus: ReviewField["inferenceStatus"],
): string {
  if (inferenceStatus === "inferred_needs_review") {
    return "Found in your resume — your confirmation is needed";
  }
  switch (provenance.kind) {
    case "pdf":
      return `Imported from page ${provenance.pageNumber}`;
    case "docx":
      return provenance.documentPart === "body"
        ? "Imported from the document body"
        : `Imported from the document ${provenance.documentPart}`;
    case "user_added":
      return "Added by you";
    case "user_edited":
      return provenance.original?.kind === "pdf"
        ? `Edited by you; originally imported from page ${provenance.original.pageNumber}`
        : "Edited by you";
    case "inferred":
      return "Found in your resume — your confirmation is needed";
    case "minimal":
      return "Imported from initial resume";
    case "semantic":
      return "Found in your resume";
  }
}
