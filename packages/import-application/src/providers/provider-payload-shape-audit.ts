import type { ResumeSemanticParseRequest } from "../semantic-parser/resume-semantic-parser-provider.js";

export interface ProviderRequestShapeAudit {
  readonly normalizedTranscriptCharacterCount: number;
  readonly fragmentCount: number;
  readonly requestJsonBytes: number;
  readonly instructionBytes: number;
  readonly documentPayloadBytes: number;
  readonly semanticInputBytes: number;
  readonly transportEnvelopeBytes: number;
}

export interface ProviderResponseShapeAudit {
  readonly responseJsonBytes: number;
  readonly candidateCount: number;
  readonly sourceRefCount: number;
  readonly sourceRefQuoteBytes: number;
  readonly candidateValueBytes: number;
  readonly expectedEnvelopeStructuralBytes: number;
  readonly emptyArrayCount: number;
  readonly nullValueCount: number;
  readonly repeatedFragmentIdCount: number;
  readonly providerGeneratedIdCount: number;
  readonly providerMetadataFieldCount: number;
}

/**
 * Returns only aggregate shape data. It deliberately never returns or logs
 * transcript text, prompts, quotes, URLs, identifiers, or provider values.
 */
export function auditProviderRequestShape(input: {
  readonly request: ResumeSemanticParseRequest;
  readonly instructions: string;
}): ProviderRequestShapeAudit {
  const document = {
    format: input.request.documentFormat,
    language: input.request.languageContext.detectedLanguage,
    fragments: input.request.sourceFragments.map((fragment) => ({
      fragmentId: `fragment-${fragment.order + 1}`,
      order: fragment.order,
      text: fragment.text,
    })),
  };
  const semanticInput = {
    contract: "nuvitae.semantic-extraction.v2",
    document,
  };
  const serializedInstructions = input.instructions;
  const serializedInput = JSON.stringify(semanticInput);
  const transportBody = {
    model: "gpt-5.6-sol",
    instructions: serializedInstructions,
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: serializedInput }],
      },
    ],
    reasoning: { effort: "low" },
    store: false,
    stream: true,
    include: [],
    prompt_cache_key: "00000000-0000-4000-8000-000000000000",
    text: { verbosity: "low" },
    client_metadata: {
      "x-codex-installation-id": "00000000-0000-4000-8000-000000000000",
      session_id: "00000000-0000-4000-8000-000000000000",
      thread_id: "00000000-0000-4000-8000-000000000000",
      "x-codex-window-id": "00000000-0000-4000-8000-000000000000",
    },
  };
  const serializedBody = JSON.stringify(transportBody);
  const envelopeOnly = JSON.stringify({
    ...transportBody,
    instructions: "",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "" }],
      },
    ],
  });

  return {
    normalizedTranscriptCharacterCount:
      input.request.normalizedTranscript.text.length,
    fragmentCount: input.request.sourceFragments.length,
    requestJsonBytes: Buffer.byteLength(serializedBody, "utf8"),
    instructionBytes: Buffer.byteLength(serializedInstructions, "utf8"),
    documentPayloadBytes: Buffer.byteLength(JSON.stringify(document), "utf8"),
    semanticInputBytes: Buffer.byteLength(serializedInput, "utf8"),
    transportEnvelopeBytes: Buffer.byteLength(envelopeOnly, "utf8"),
  };
}

/**
 * Measures a deterministic V2 fixture without retaining any source content.
 */
export function auditProviderResponseShape(
  response: unknown,
): ProviderResponseShapeAudit {
  const serialized = JSON.stringify(response);
  const counts = {
    candidateCount: 0,
    sourceRefCount: 0,
    sourceRefQuoteBytes: 0,
    candidateValueBytes: 0,
    emptyArrayCount: 0,
    nullValueCount: 0,
    repeatedFragmentIdCount: 0,
    providerGeneratedIdCount: 0,
    providerMetadataFieldCount: 0,
  };
  const seenFragmentIds = new Set<string>();

  walk(response, (value, key) => {
    if (value === null) {
      counts.nullValueCount += 1;
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) counts.emptyArrayCount += 1;
      return;
    }
    if (!isRecord(value)) return;
    if (key === "candidateId" || key === "providerId")
      counts.providerGeneratedIdCount += 1;
    if (
      key === "confidence" ||
      key === "classification" ||
      key === "normalizedValue" ||
      key === "hash" ||
      key === "line" ||
      key === "start" ||
      key === "end"
    )
      counts.providerMetadataFieldCount += 1;

    if (typeof value.value === "string" && Array.isArray(value.sourceRefs)) {
      counts.candidateCount += 1;
      counts.candidateValueBytes += Buffer.byteLength(value.value, "utf8");
      for (const sourceRef of value.sourceRefs) {
        if (!isRecord(sourceRef)) continue;
        counts.sourceRefCount += 1;
        if (typeof sourceRef.quote === "string") {
          counts.sourceRefQuoteBytes += Buffer.byteLength(
            sourceRef.quote,
            "utf8",
          );
        }
        if (typeof sourceRef.fragmentId === "string") {
          if (seenFragmentIds.has(sourceRef.fragmentId))
            counts.repeatedFragmentIdCount += 1;
          seenFragmentIds.add(sourceRef.fragmentId);
        }
      }
    }
  });

  return {
    responseJsonBytes: Buffer.byteLength(serialized, "utf8"),
    ...counts,
    expectedEnvelopeStructuralBytes:
      Buffer.byteLength(serialized, "utf8") -
      counts.candidateValueBytes -
      counts.sourceRefQuoteBytes,
  };
}

function walk(
  value: unknown,
  visit: (value: unknown, key: string | undefined) => void,
  key?: string,
): void {
  visit(value, key);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  for (const [childKey, child] of Object.entries(value))
    walk(child, visit, childKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
