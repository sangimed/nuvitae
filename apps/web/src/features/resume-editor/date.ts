import type { ReviewField } from "@nuvitae/contracts";

export type ResumeDate = Extract<
  ReviewField["value"],
  { readonly kind: "date" }
>["value"];

export function formatResumeDate(value: ResumeDate): string {
  if (value.precision === "present") return value.originalText ?? "Present";
  if (value.precision === "month") {
    return `${String(value.month).padStart(2, "0")}/${value.year}`;
  }
  return String(value.year);
}

export function formatResumeDateRange(
  value: Extract<ReviewField["value"], { readonly kind: "date_range" }>,
): string {
  const start =
    value.startDate === undefined
      ? undefined
      : formatResumeDate(value.startDate);
  const end =
    value.endDate !== undefined
      ? formatResumeDate(value.endDate)
      : value.isOngoing
        ? "Present"
        : undefined;
  if (start !== undefined && end !== undefined) return `${start} – ${end}`;
  return start ?? end ?? "Date range";
}
