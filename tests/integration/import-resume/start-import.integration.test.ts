import type { ImportAggregate } from "@nuvitae/persistence";
import { afterEach, describe, expect, it } from "vitest";
import {
  createHttpHarness,
  postFile,
  verifiedUserId,
} from "./start-import-test-harness.js";

const openApps: { close(): Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("POST /import-resume", () => {
  it.each([
    ["resume.pdf", "application/pdf"],
    [
      "resume.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  ])("accepts one authenticated %s upload", async (filename, contentType) => {
    const harness = await createTrackedHarness({ principal: "valid" });
    const response = await postFile(harness.baseUrl, {
      filename,
      contentType,
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      version: "2026-07-28",
      status: "import_initialization",
      uploadStatus: "uploaded",
      retentionExpiresAt: "2026-08-05T09:30:00.000Z",
      manualEntryUrl: "/resumes/new/manual",
    });
    const aggregate = harness.repository.createImportAggregate.mock
      .calls[0]?.[0] as ImportAggregate;
    expect(aggregate.document.ownerUserId).toBe(verifiedUserId);
    expect(aggregate.artifacts).toEqual([]);
    expect(harness.storageObjects.size).toBe(1);
  });

  it("rejects missing and multiple file fields without use-case effects", async () => {
    for (const request of [{ includeFile: false }, { secondFile: true }]) {
      const harness = await createTrackedHarness({ principal: "valid" });
      const response = await postFile(harness.baseUrl, request);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "unsafe_upload_metadata",
      });
      expect(harness.storage.writeObject).not.toHaveBeenCalled();
      expect(harness.limits.reserveAttempt).not.toHaveBeenCalled();
      expect(harness.repository.createImportAggregate).not.toHaveBeenCalled();
    }
  });

  it("enforces the configured multipart byte limit before the service", async () => {
    const harness = await createTrackedHarness({
      principal: "valid",
      maxUploadSizeBytes: 4,
    });
    const response = await postFile(harness.baseUrl, {
      content: "five!",
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      statusCode: 413,
      code: "oversized_file",
      message: "Choose a resume within the upload size limit.",
    });
    expect(harness.storage.writeObject).not.toHaveBeenCalled();
    expect(harness.limits.reserveAttempt).not.toHaveBeenCalled();
  });

  it("maps attempt denial to 429 with Retry-After", async () => {
    const harness = await createTrackedHarness({
      principal: "valid",
      limitDenial: {
        outcome: {
          kind: "denied",
          code: "upload_attempt_limit",
          messageCategory: "upload_attempts",
          retryable: true,
          retryAfterSeconds: 37,
        },
      },
    });
    const response = await postFile(harness.baseUrl);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(await response.json()).toMatchObject({
      code: "rate_limited",
    });
    expect(harness.storage.writeObject).not.toHaveBeenCalled();
  });

  it("maps unavailable limit, storage, and persistence state without raw details", async () => {
    const cases = [
      {
        options: {
          principal: "valid" as const,
          limitDenial: {
            outcome: {
              kind: "denied" as const,
              code: "limit_service_unavailable" as const,
              messageCategory: "service_unavailable" as const,
              retryable: true,
            },
          },
        },
        expectedCode: "import_limit_unavailable",
      },
      {
        options: {
          principal: "valid" as const,
          storageFailure: "/private/root Candidate.pdf source secret",
        },
        expectedCode: "storage_unavailable",
      },
      {
        options: {
          principal: "valid" as const,
          persistenceFailure:
            "password=secret SELECT * FROM imported_documents",
        },
        expectedCode: "persistence_unavailable",
      },
    ];
    for (const testCase of cases) {
      const harness = await createTrackedHarness(testCase.options);
      const response = await postFile(harness.baseUrl, {
        filename: "Candidate.pdf",
        content: "%PDF-1.7\nsource secret",
      });
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body).toMatchObject({ code: testCase.expectedCode });
      const serialized = JSON.stringify({ body, logs: harness.logs });
      expect(serialized).not.toContain("Candidate.pdf");
      expect(serialized).not.toContain("source secret");
      expect(serialized).not.toContain("password=secret");
      expect(serialized).not.toContain("/private/root");
    }
  });
});

async function createTrackedHarness(
  options: Parameters<typeof createHttpHarness>[0],
) {
  const harness = await createHttpHarness(options);
  openApps.push(harness.app);
  return harness;
}
