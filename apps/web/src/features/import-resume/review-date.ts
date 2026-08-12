import type { ReviewField } from "@nuvitae/contracts";

export type ReviewDate = Extract<
  ReviewField["value"],
  { readonly kind: "date" }
>["value"];

export function formatReviewDate(value: ReviewDate): string {
  if (value.precision === "present") return value.originalText ?? "Present";
  if (value.precision === "month") {
    return `${String(value.month).padStart(2, "0")}/${value.year}`;
  }
  return String(value.year);
}

export function formatReviewDateRange(
  value: Extract<ReviewField["value"], { readonly kind: "date_range" }>,
): string {
  const start =
    value.startDate === undefined
      ? undefined
      : formatReviewDate(value.startDate);
  const end =
    value.endDate !== undefined
      ? formatReviewDate(value.endDate)
      : value.isOngoing
        ? "Present"
        : undefined;
  if (start !== undefined && end !== undefined) return `${start} – ${end}`;
  return start ?? end ?? "Date range";
}
