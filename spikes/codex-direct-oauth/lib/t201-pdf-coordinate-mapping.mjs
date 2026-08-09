export const T201_PDF_COORDINATE_MAPPING_VERSION = 1;

const PDF_ITEM = /^\[page=(\d+)(?:\s+column=[^\]]+)?\s+item=(\d+)\]\s?(.*)$/;

export function buildT201PdfCoordinateMapping(fixture) {
  const lines = String(fixture).replace(/\n$/, "").split("\n");
  const items = new Map();
  for (const [index, line] of lines.entries()) {
    const match = line.match(PDF_ITEM);
    if (!match) continue;
    items.set(index + 1, {
      mapping_version: T201_PDF_COORDINATE_MAPPING_VERSION,
      page: Number(match[1]),
      item: Number(match[2]),
      content_start: line.length - match[3].length,
      content_length: match[3].length,
    });
  }
  return items;
}

export function physicalCoordinatesForEvidence(mapping, evidence) {
  const item = mapping.get(evidence.line);
  if (!item) return null;
  return {
    mapping_version: item.mapping_version,
    page: item.page,
    item: item.item,
    start: evidence.start - item.content_start,
    end: evidence.end - item.content_start,
  };
}

export function validateT201PdfEvidenceMapping(mapping, evidence) {
  const expected = physicalCoordinatesForEvidence(mapping, evidence);
  const physical = evidence?.physical;
  if (!expected || !physical || typeof physical !== "object") return false;
  return (
    physical.mapping_version === expected.mapping_version &&
    physical.page === expected.page &&
    physical.item === expected.item &&
    Number.isInteger(physical.start) &&
    Number.isInteger(physical.end) &&
    physical.start >= 0 &&
    physical.end > physical.start &&
    physical.start === expected.start &&
    physical.end === expected.end &&
    physical.end <= mapping.get(evidence.line).content_length
  );
}
