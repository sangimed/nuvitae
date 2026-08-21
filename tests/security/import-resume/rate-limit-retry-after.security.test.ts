import { describe, expect, it } from "vitest";
import {
  createHttpHarness,
  postFile,
} from "../../integration/import-resume/start-import-test-harness.js";
import type { DeniedImportLimitOutcome } from "@nuvitae/import-application";

interface LimitResponseBody {
  statusCode: number;
  code: string;
  message: string;
}

describe("import rate-limit Retry-After and HTTP responses (T111)", () => {
  function deniedOutcome(
    overrides: Partial<DeniedImportLimitOutcome>,
  ): DeniedImportLimitOutcome {
    return {
      kind: "denied",
      code: "upload_attempt_limit",
      messageCategory: "upload_attempts",
      retryable: true,
      ...overrides,
    };
  }

  async function getBody(response: Response): Promise<LimitResponseBody> {
    return response.json() as Promise<LimitResponseBody>;
  }

  describe("upload-attempt limit", () => {
    it("returns HTTP 429 for upload-attempt limit with positive Retry-After", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 120,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        const body = await getBody(response);
        expect(body.code).toBe("rate_limited");
        expect(typeof body.message).toBe("string");
        expect(response.headers.get("retry-after")).toBe("120");
      } finally {
        await harness.app.close();
      }
    });

    it("returns a positive integer Retry-After for upload-attempt limit", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 1,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        const retryAfter = response.headers.get("retry-after");
        expect(retryAfter).toBeTruthy();
        const parsed = parseInt(retryAfter!, 10);
        expect(Number.isInteger(parsed)).toBe(true);
        expect(parsed).toBeGreaterThan(0);
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("active-job limit", () => {
    it("returns HTTP 429 without Retry-After", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "active_job_limit",
            messageCategory: "active_processing",
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBeNull();
        const body = await getBody(response);
        expect(body.code).toBe("active_job_limit_reached");
        expect(typeof body.message).toBe("string");
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("queued-job limit", () => {
    it("returns HTTP 429 without Retry-After", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "queued_job_limit",
            messageCategory: "queued_processing",
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBeNull();
        const body = await getBody(response);
        expect(body.code).toBe("queued_job_limit_reached");
        expect(typeof body.message).toBe("string");
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("processing-start denial", () => {
    it("returns HTTP 429 without Retry-After and no internal state disclosure", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "processing_start_limit",
            messageCategory: "processing_start",
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBeNull();
        const body = await getBody(response);
        expect(body.code).toBe("processing_start_denied");
        expect(typeof body.message).toBe("string");
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("limit-service failure", () => {
    it("returns HTTP 503 with safe generic response", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "limit_service_unavailable",
            messageCategory: "service_unavailable",
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(503);
        expect(response.headers.get("retry-after")).toBeNull();
        const body = await getBody(response);
        expect(body.code).toBe("import_limit_unavailable");
        expect(typeof body.message).toBe("string");
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("rolling-window boundary", () => {
    it("keeps Retry-After positive and exact while blocked at the boundary", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 1,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        const retryAfter = response.headers.get("retry-after");
        expect(retryAfter).toBe("1");
        const parsed = parseInt(retryAfter!, 10);
        expect(Number.isInteger(parsed)).toBe(true);
        expect(parsed).toBeGreaterThan(0);
      } finally {
        await harness.app.close();
      }
    });

    it("does not emit a zero or negative Retry-After while admission is still blocked", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 595,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("595");
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("client input neutrality", () => {
    it("ignores client-provided timestamps when computing the limit decision", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 60,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl, {
          headers: {
            Date: "Wed, 01 Jan 2031 00:00:00 GMT",
            "If-Modified-Since": "Wed, 01 Jan 2031 00:00:00 GMT",
            "X-Import-Date": "2031-01-01T00:00:00.000Z",
          },
        });
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
      } finally {
        await harness.app.close();
      }
    });

    it("ignores malformed client date headers", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 30,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl, {
          headers: {
            Date: "not-a-valid-date",
            "If-Modified-Since": "garbage",
            "X-Import-Date": "",
          },
        });
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("30");
        const body = await getBody(response);
        expect(body.code).toBe("rate_limited");
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("deterministic rejection", () => {
    it("rejects identically on repeated identical requests", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 120,
          }),
        },
      });
      try {
        const first = await postFile(harness.baseUrl);
        const second = await postFile(harness.baseUrl);
        expect(first.status).toBe(429);
        expect(second.status).toBe(429);
        expect(first.headers.get("retry-after")).toBe("120");
        expect(second.headers.get("retry-after")).toBe("120");
        expect(await getBody(first)).toEqual(await getBody(second));
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("rejection side effects", () => {
    it("creates no import, storage, queue, draft, or retention artifacts after rejection", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 60,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        expect(harness.storageObjects.size).toBe(0);
        expect(harness.storage.writeObject).not.toHaveBeenCalled();
        expect(harness.repository.createImportAggregate).not.toHaveBeenCalled();
        expect(harness.transactionRunner.transaction).not.toHaveBeenCalled();
        expect(harness.queuePublisher.addBulk).not.toHaveBeenCalled();
        const body = await getBody(response);
        expect(body).not.toHaveProperty("importId");
        expect(body).not.toHaveProperty("retentionExpiresAt");
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("owner isolation", () => {
    it("limits one owner without affecting another owner", async () => {
      const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const harness = await createHttpHarness({
        principal: "valid",
        principalUserId: ownerB,
        limitDenial: {
          denialForPrincipal: (ownerUserId: string) =>
            ownerUserId === ownerB
              ? deniedOutcome({
                  code: "upload_attempt_limit",
                  retryAfterSeconds: 60,
                })
              : undefined,
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        const body = await getBody(response);
        expect(body.code).toBe("rate_limited");
        expect(JSON.stringify(body)).not.toContain(ownerB);
      } finally {
        await harness.app.close();
      }
    });
  });

  describe("privacy", () => {
    it("does not expose owner IDs, import IDs, or counts in responses", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 60,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        const body = await getBody(response);
        const bodyStr = JSON.stringify(body);
        expect(bodyStr).not.toContain("owner");
        expect(bodyStr).not.toContain("import_id");
        expect(bodyStr).not.toContain("aaaa");
        expect(bodyStr).not.toContain("bbbb");
        expect(bodyStr).not.toMatch(/\bcount\b/i);
        expect(bodyStr).not.toMatch(/\bqueued\b/i);
        expect(bodyStr).not.toMatch(/\bactive\b/i);
        expect(bodyStr).not.toMatch(/\breserved\b/i);
        expect(bodyStr).not.toContain("advisory");
        expect(bodyStr).not.toContain("lock");
        expect(bodyStr).not.toContain("SQL");
        expect(bodyStr).not.toContain("worker");
        expect(bodyStr).not.toContain("queue");
        expect(bodyStr).not.toContain("stack");
      } finally {
        await harness.app.close();
      }
    });

    it("does not expose timestamps or durations in limit responses", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 30,
          }),
        },
      });
      try {
        const response = await postFile(harness.baseUrl);
        const body = await getBody(response);
        const bodyStr = JSON.stringify(body);
        expect(bodyStr).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        expect(bodyStr).not.toMatch(/T\d{2}:\d{2}/);
      } finally {
        await harness.app.close();
      }
    });

    it("logs only the closed privacy-safe limit events", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 45,
          }),
        },
      });
      try {
        await postFile(harness.baseUrl);
        const events = harness.logs.map((log: unknown) =>
          typeof log === "object" && log !== null && "event" in log
            ? (log as { event: string }).event
            : "",
        );
        const limitEvents = events.filter((e: string) =>
          e.startsWith("import."),
        );
        for (const event of limitEvents) {
          expect([
            "import.rate_limited",
            "import.active_limit_reached",
            "import.queued_limit_reached",
            "import.processing_start_denied",
            "import.limit_service_failed",
            "import.response_contract_failed",
            "import.created",
            "import.upload_rejected",
            "import.worker_failed",
            "import.unexpected_failure",
          ]).toContain(event);
        }
      } finally {
        await harness.app.close();
      }
    });

    it("does not leak sensitive data in logs", async () => {
      const harness = await createHttpHarness({
        principal: "valid",
        limitDenial: {
          outcome: deniedOutcome({
            code: "upload_attempt_limit",
            retryAfterSeconds: 60,
          }),
        },
      });
      try {
        await postFile(harness.baseUrl);
        const logStr = JSON.stringify(harness.logs);
        expect(logStr).not.toContain("synthetic resume");
        expect(logStr).not.toContain("aaaa");
        expect(logStr).not.toContain("bbbb");
        expect(logStr).not.toContain("password");
      } finally {
        await harness.app.close();
      }
    });
  });
});
