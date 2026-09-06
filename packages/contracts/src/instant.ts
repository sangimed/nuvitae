import { z } from "zod";

/**
 * A complete ISO-8601 instant with an explicit UTC offset. Use this when
 * decoding a trusted provider boundary that may send either `Z` or an offset.
 * Calendar and partial resume dates deliberately do not use this schema.
 */
export const offsetAwareInstantSchema = z.string().datetime({ offset: true });

/**
 * Nuvitae's canonical wire representation for an instant: ISO-8601 UTC with
 * a trailing `Z`. APIs and durable job payloads serialize dates this way so a
 * consumer never applies its local timezone while parsing an absolute time.
 */
export const utcInstantSchema = offsetAwareInstantSchema.refine(
  (value) => value.endsWith("Z"),
  "Instant must use canonical UTC `Z` serialization.",
);

export function parseOffsetAwareInstant(value: unknown): Date | null {
  const parsed = offsetAwareInstantSchema.safeParse(value);
  if (!parsed.success) return null;
  const instant = new Date(parsed.data);
  return Number.isNaN(instant.getTime()) ? null : instant;
}
