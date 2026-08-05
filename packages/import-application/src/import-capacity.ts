import type { ImportedDocument } from "@nuvitae/domain";

export interface ImportProcessingCapacityPort {
  admitToProcessing(
    ownerUserId: string,
    importId: string,
    now: Date,
  ): Promise<{ kind: "allowed" } | { kind: "denied"; code: string }>;

  releaseCapacity(
    ownerUserId: string,
    importId: string,
    now: Date,
  ): Promise<void>;
}

export class ProcessingStartDeniedError extends Error {
  constructor() {
    super("processing_start_denied");
    this.name = "ProcessingStartDeniedError";
  }
}

const capacityStates = new Set<ImportedDocument["processingStatus"]>([
  "not_started",
  "queued",
  "processing",
  "semantic_parsing_pending",
  "semantic_parsing_running",
]);

export function consumesProcessingCapacity(
  processingStatus: ImportedDocument["processingStatus"],
): boolean {
  return capacityStates.has(processingStatus);
}
