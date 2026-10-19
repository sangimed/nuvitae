import { describe, expect, it } from "vitest";
import type { ImportEventRecord } from "./import-events.js";
import { createImportTelemetryAdapter } from "./telemetry-adapter.js";

const timingRecord: ImportEventRecord = {
  level: "info",
  event: "import.timing",
  metadata: {
    importId: "11111111-1111-4111-8111-111111111111",
    correlationId: "22222222-2222-4222-8222-222222222222",
    phase: "worker_started",
    source: "worker",
    jobType: "validation",
    timestampMs: 1_789_000_000_000,
    durationMs: 42,
    queueJobId: "import-11111111-1111-4111-8111-111111111111-validation-v1",
    deliveryId: "33333333-3333-4333-8333-333333333333",
    retryOrdinal: 1,
  },
};

describe("import telemetry adapter", () => {
  it("is disabled by default and exports nothing", () => {
    const records: unknown[] = [];
    const adapter = createImportTelemetryAdapter({
      write: (record) => records.push(record),
    });

    adapter.write(timingRecord);

    expect(records).toEqual([]);
  });

  it("projects only allowlisted fixed timing metadata when explicitly enabled", () => {
    const records: unknown[] = [];
    const adapter = createImportTelemetryAdapter({
      enabled: true,
      write: (record) => records.push(record),
    });

    adapter.write(timingRecord);

    expect(records).toEqual([
      {
        name: "import.timing",
        attributes: {
          phase: "worker_started",
          source: "worker",
          jobType: "validation",
          durationMs: 42,
          retryOrdinal: 1,
        },
      },
    ]);
    expect(JSON.stringify(records)).not.toMatch(
      /11111111|22222222|33333333|queueJobId|timestampMs/,
    );
  });

  it("does not create telemetry records for other canonical events", () => {
    const records: unknown[] = [];
    const adapter = createImportTelemetryAdapter({
      enabled: true,
      write: (record) => records.push(record),
    });

    adapter.write({
      level: "warn",
      event: "import.worker_failed",
      metadata: {
        importId: "11111111-1111-4111-8111-111111111111",
        correlationId: "22222222-2222-4222-8222-222222222222",
        jobType: "validation",
        errorCategory: "unexpected_failure",
        retryable: false,
      },
    });

    expect(records).toEqual([]);
  });
});
