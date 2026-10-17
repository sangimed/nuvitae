import { describe, expect, it } from "vitest";
import {
  createImportEventEmitter,
  emitImportTiming,
  emitImportEvent,
  type ImportEventRecord,
} from "./import-events.js";

describe("canonical import timing", () => {
  it("rejects arbitrary worker job labels at the event boundary", () => {
    const records: ImportEventRecord[] = [];
    emitImportEvent(
      { write: (record) => records.push(record) },
      "import.timing",
      {
        importId: "11111111-1111-4111-8111-111111111111",
        phase: "worker_started",
        source: "worker",
        timestampMs: 1,
        jobType: "synthetic-private-stage",
      },
    );
    expect(records).toEqual([]);
  });

  it("emits a reconstructable timestamp and bounded elapsed duration from a fake clock", () => {
    const records: ImportEventRecord[] = [];
    const emitter = createImportEventEmitter({
      write: (record) => records.push(record),
    });
    const uploadReceivedAt = new Date("2026-08-12T10:00:00.000Z");

    emitImportTiming(emitter, {
      importId: "11111111-1111-4111-8111-111111111111",
      correlationId: "11111111-1111-4111-8111-111111111111",
      phase: "queue_enqueued",
      source: "api",
      at: new Date("2026-08-12T10:00:00.123Z"),
      durationMs: 123,
      uploadReceivedAt,
    });

    expect(records).toEqual([
      {
        level: "info",
        event: "import.timing",
        metadata: {
          importId: "11111111-1111-4111-8111-111111111111",
          correlationId: "11111111-1111-4111-8111-111111111111",
          phase: "queue_enqueued",
          source: "api",
          timestampMs: Date.parse("2026-08-12T10:00:00.123Z"),
          durationMs: 123,
          elapsedSinceUploadMs: 123,
        },
      },
    ]);
  });

  it("rejects content-shaped identifiers without writing a timing record", () => {
    const records: ImportEventRecord[] = [];
    const emitter = createImportEventEmitter({
      write: (record) => records.push(record),
    });

    emitImportTiming(emitter, {
      importId: "resume contents",
      phase: "review_rendered",
      source: "web",
      at: new Date("2026-08-12T10:00:00.000Z"),
    });

    expect(records).toHaveLength(0);
  });
});
