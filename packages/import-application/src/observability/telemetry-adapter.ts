import type { ImportEventRecord, ImportEventSink } from "./import-events.js";

export interface ImportTelemetryRecord {
  readonly name: "import.timing";
  readonly attributes: Readonly<{
    phase: string;
    source: string;
    jobType?: string;
    durationMs?: number;
    elapsedSinceUploadMs?: number;
    retryOrdinal?: number;
  }>;
}

/**
 * An opt-in composition boundary for a future telemetry SDK/exporter.
 *
 * It deliberately accepts already-sanitized canonical events, projects only
 * the fixed timing fields useful for aggregate operational measurement, and
 * excludes every identifier and timestamp. Supplying this adapter alone never
 * creates a network client, listener, exporter, or background work.
 */
export interface ImportTelemetryAdapter extends ImportEventSink {
  readonly enabled: boolean;
}

export function createImportTelemetryAdapter(options: {
  readonly enabled?: boolean;
  readonly write: (record: ImportTelemetryRecord) => void;
}): ImportTelemetryAdapter {
  const enabled = options.enabled === true;
  return {
    enabled,
    write(record: ImportEventRecord): void {
      if (!enabled || record.event !== "import.timing") return;
      const metadata = record.metadata;
      const phase = metadata.phase;
      const source = metadata.source;
      if (typeof phase !== "string" || typeof source !== "string") return;
      const projected: ImportTelemetryRecord = {
        name: "import.timing",
        attributes: {
          phase,
          source,
          ...(typeof metadata.jobType === "string"
            ? { jobType: metadata.jobType }
            : {}),
          ...(typeof metadata.durationMs === "number"
            ? { durationMs: metadata.durationMs }
            : {}),
          ...(typeof metadata.elapsedSinceUploadMs === "number"
            ? { elapsedSinceUploadMs: metadata.elapsedSinceUploadMs }
            : {}),
          ...(typeof metadata.retryOrdinal === "number"
            ? { retryOrdinal: metadata.retryOrdinal }
            : {}),
        },
      };
      try {
        options.write(projected);
      } catch {
        // Telemetry remains strictly non-blocking when an opt-in sink fails.
      }
    },
  };
}
