"use client";

import type { ReviewField } from "@nuvitae/contracts";
import { useTranslation } from "../../i18n/LocaleProvider";

export function FieldProvenance(props: {
  readonly provenance: ReviewField["provenance"];
  readonly inferenceStatus: ReviewField["inferenceStatus"];
}) {
  const { t } = useTranslation();
  return (
    <span className="field-provenance">
      {label(props.provenance, props.inferenceStatus, t)}
    </span>
  );
}

function label(
  provenance: ReviewField["provenance"],
  inferenceStatus: ReviewField["inferenceStatus"],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (inferenceStatus === "inferred_needs_review") {
    return t("review.provenance.inferred");
  }
  switch (provenance.kind) {
    case "pdf":
      return `${t("review.provenance.pdf")} ${provenance.pageNumber}`;
    case "docx":
      return provenance.documentPart === "body"
        ? t("review.provenance.docxBody")
        : `${t("review.provenance.docxPart")} ${provenance.documentPart}`;
    case "user_added":
      return t("review.provenance.added");
    case "user_edited":
      return provenance.original?.kind === "pdf"
        ? `${t("review.provenance.editedPdf")} ${provenance.original.pageNumber}`
        : t("review.provenance.edited");
    case "inferred":
      return t("review.provenance.inferred");
    case "minimal":
      return t("review.provenance.initial");
    case "semantic":
      return t("review.provenance.found");
  }
}
