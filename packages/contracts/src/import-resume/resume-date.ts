import { z } from "zod";

const dateYearSchema = z.number().int().min(1900).max(2100);
const dateMonthSchema = z.number().int().min(1).max(12);
const originalTextSchema = z.string().min(1).max(80).optional();

/**
 * The one wire representation for source-precision dates used by review,
 * confirmation, manual drafts, and structured resumes.
 *
 * A present/current value is an explicit variant: it has no calendar
 * components because the source did not provide any. No timezone or day is
 * invented for partial dates.
 */
export const resumeDateSchema = z.discriminatedUnion("precision", [
  z
    .object({
      year: dateYearSchema,
      precision: z.literal("year"),
      originalText: originalTextSchema,
    })
    .strict(),
  z
    .object({
      year: dateYearSchema,
      month: dateMonthSchema,
      precision: z.literal("month"),
      originalText: originalTextSchema,
    })
    .strict(),
  z
    .object({
      precision: z.literal("present"),
      originalText: originalTextSchema,
    })
    .strict(),
]);

export type ResumeDateContract = z.infer<typeof resumeDateSchema>;
