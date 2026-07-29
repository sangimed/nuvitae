import { describe, expect, it } from "vitest";

import {
  PrivacyLogger,
  type PrivacyLogRecord,
  type PrivacyLogSink,
} from "./privacy-logger.js";

class RecordingSink implements PrivacyLogSink {
  readonly records: PrivacyLogRecord[] = [];

  write(record: PrivacyLogRecord): void {
    this.records.push(record);
  }
}

describe("PrivacyLogger", () => {
  it("keeps operational identifiers and recursively redacts credentials", () => {
    const sink = new RecordingSink();
    const logger = new PrivacyLogger(sink, { production: true });

    logger.info("import.validation.completed", {
      correlationId: "correlation-123",
      requestId: "request-123",
      operationName: "validate-import",
      importId: "import-123",
      jobId: "job-123",
      statusCode: 202,
      durationMs: 41,
      retryCount: 1,
      credentials: {
        password: "credential-value",
        clientSecret: "client-secret-value",
      },
    });

    expect(sink.records[0]).toMatchObject({
      level: "info",
      event: "import.validation.completed",
      metadata: {
        correlationId: "correlation-123",
        requestId: "request-123",
        operationName: "validate-import",
        importId: "import-123",
        jobId: "job-123",
        statusCode: 202,
        durationMs: 41,
        retryCount: 1,
        credentials: "[REDACTED]",
      },
    });
    expect(JSON.stringify(sink.records)).not.toContain("credential-value");
    expect(JSON.stringify(sink.records)).not.toContain("client-secret-value");
  });

  it("redacts authorization headers and cookies case-insensitively", () => {
    const sink = new RecordingSink();
    const logger = new PrivacyLogger(sink);

    logger.warn("request.rejected", {
      Headers: {
        AUTHORIZATION: "Bearer unsafe-token",
        Cookie: "session=unsafe-cookie",
      },
      setCOOKIE: "unsafe-response-cookie",
    });

    const output = JSON.stringify(sink.records);
    expect(output).not.toContain("unsafe-token");
    expect(output).not.toContain("unsafe-cookie");
    expect(output).toContain("[REDACTED]");
  });

  it("removes resume text, snippets, prompts, filenames, buffers, and contact data", () => {
    const sink = new RecordingSink();
    const logger = new PrivacyLogger(sink, { production: true });

    logger.info("import.received", {
      resumeContent: "Synthetic private career narrative",
      rawText: "Synthetic extracted raw text",
      sourceSnippet: "Synthetic source snippet",
      prompt: "Synthetic model prompt",
      originalFilename: "synthetic-person-resume.pdf",
      upload: Buffer.from("synthetic upload bytes"),
      contact: {
        email: "person@example.invalid",
        phoneNumber: "+33 1 00 00 00 00",
        address: "1 Synthetic Street",
      },
      unknownProfile: {
        arbitrary: "nested personal value",
      },
    });

    const output = JSON.stringify(sink.records);
    for (const unsafeValue of [
      "career narrative",
      "extracted raw text",
      "source snippet",
      "model prompt",
      "synthetic-person-resume.pdf",
      "upload bytes",
      "person@example.invalid",
      "+33 1 00 00 00 00",
      "Synthetic Street",
      "nested personal value",
    ]) {
      expect(output).not.toContain(unsafeValue);
    }
  });

  it("serializes Error instances without stack traces or driver diagnostics", () => {
    const sink = new RecordingSink();
    const logger = new PrivacyLogger(sink, { production: true });
    const error = new Error("driver connection failed at private-host");
    Object.assign(error, {
      detail: "database row diagnostics",
      query: "SELECT private_resume_content",
    });

    logger.error("import.persistence.failed", {
      error,
      errorCode: "IMPORT_STATE_UNAVAILABLE",
    });

    expect(sink.records[0]?.metadata).toEqual({
      error: {
        name: "Error",
        message: "[REDACTED]",
      },
      errorCode: "IMPORT_STATE_UNAVAILABLE",
    });
    const output = JSON.stringify(sink.records);
    expect(output).not.toContain("private-host");
    expect(output).not.toContain("database row diagnostics");
    expect(output).not.toContain("SELECT");
    expect(output).not.toContain("stack");
  });

  it("handles circular values without mutation", () => {
    const sink = new RecordingSink();
    const logger = new PrivacyLogger(sink);
    const metadata: Record<string, unknown> = {
      correlationId: "correlation-456",
      nested: { secret: "do-not-copy" },
    };
    metadata.circular = metadata;
    const beforeNested = metadata.nested;

    expect(() => logger.debug("import.circular", metadata)).not.toThrow();
    expect(metadata.nested).toBe(beforeNested);
    expect(metadata.circular).toBe(metadata);
    expect(JSON.stringify(sink.records)).not.toContain("do-not-copy");
  });
});
