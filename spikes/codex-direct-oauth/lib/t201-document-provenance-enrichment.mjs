// Deterministic post-model provenance enrichment for the T201 matrix.
//
// Corrected contract (T208): the model output must contain only canonical
// flattened evidence (`line`, `start`, `end`, `fragment_hash`, `category`).
// Physical PDF provenance (`page`, `item`, offsets) and DOCX structural
// metadata are derived deterministically AFTER semantic evaluation, so a
// semantic result never fails because model-produced physical coordinates
// disagree with the deterministic mapping. Enrichment failure is reported as
// an enrichment/provenance issue, never as a semantic hallucination.
import {
  buildT201PdfCoordinateMapping,
  physicalCoordinatesForEvidence,
} from "./t201-pdf-coordinate-mapping.mjs";

const OOXML_ITEM =
  /^\[part=([^\]]+)\s+paragraph=(\d+)(?:\s+style=([^\]]+))?\]\s?(.*)$/;

export function enrichmentKindForManifest(manifest) {
  const kind = manifest?.extraction_format?.kind;
  if (kind === "deterministic_pdf_text") return "pdf";
  if (kind === "deterministic_ooxml_text") return "docx";
  return "none";
}

function validPhysical(physical, contentLength) {
  return Boolean(
    physical &&
      physical.mapping_version === 1 &&
      Number.isInteger(physical.page) &&
      physical.page >= 1 &&
      Number.isInteger(physical.item) &&
      physical.item >= 1 &&
      Number.isInteger(physical.start) &&
      physical.start >= 0 &&
      Number.isInteger(physical.end) &&
      physical.end > physical.start &&
      physical.end <= contentLength,
  );
}

export function enrichSingleEvidence(evidence, { fixture, manifest }) {
  const kind = enrichmentKindForManifest(manifest);
  if (kind === "pdf") {
    const mapping = buildT201PdfCoordinateMapping(fixture);
    const entry = mapping.get(evidence.line);
    if (!entry) return { mapped: false, failure: "pdf_line_not_in_mapping" };
    const physical = physicalCoordinatesForEvidence(mapping, evidence);
    if (!validPhysical(physical, entry.content_length))
      return { mapped: false, failure: "invalid_physical_mapping" };
    return { mapped: true, provenance: { physical } };
  }
  if (kind === "docx") {
    const lines = String(fixture).replace(/\n$/, "").split("\n");
    const line = lines[evidence.line - 1] ?? "";
    const match = line.match(OOXML_ITEM);
    if (!match) return { mapped: false, failure: "docx_line_not_in_mapping" };
    const [, part, paragraph, style] = match;
    return {
      mapped: true,
      provenance: {
        ooxml: { part, paragraph: Number(paragraph), style: style ?? null },
      },
    };
  }
  return { mapped: false, applicable: false, failure: null };
}

function walkEvidenceObjects(value, at, visit) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkEvidenceObjects(item, `${at}[${index}]`, visit),
    );
    return;
  }
  if (Array.isArray(value.evidence)) {
    visit(value, at);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence") continue;
    walkEvidenceObjects(child, `${at}.${key}`, visit);
  }
}

// Returns a deep copy of the output with deterministic provenance attached to
// every flattened evidence entry, plus an enrichment status. Semantic
// evaluation results are never changed by this function.
export function enrichT201Output(output, { fixture, manifest }) {
  const kind = enrichmentKindForManifest(manifest);
  const enrichedOutput = structuredClone(output);
  const status = {
    applicable: kind,
    mapped_evidence_count: 0,
    unmapped_evidence_count: 0,
    failure_count: 0,
    failures: [],
  };
  if (kind === "none") return { enrichedOutput, status };
  walkEvidenceObjects(enrichedOutput, "$", (holder) => {
    holder.evidence = holder.evidence.map((evidence) => {
      const enriched = enrichSingleEvidence(evidence, { fixture, manifest });
      if (enriched.mapped) {
        status.mapped_evidence_count += 1;
        return { ...evidence, ...enriched.provenance };
      }
      status.unmapped_evidence_count += 1;
      status.failure_count += 1;
      status.failures.push(
        enriched.failure ?? "provenance_enrichment_failed",
      );
      return evidence;
    });
  });
  status.failures = [...new Set(status.failures)].slice(0, 8);
  return { enrichedOutput, status };
}

export function evaluateT201ProvenanceEnrichment({ fixture, manifest, output }) {
  const { enrichedOutput, status } = enrichT201Output(output, {
    fixture,
    manifest,
  });
  return {
    status: {
      ...status,
      consistency_pass: status.failure_count === 0,
    },
    enrichedOutput,
  };
}
