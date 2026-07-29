import { afterEach, describe, expect, it, vi } from "vitest";
import { StartImportMultipartInterceptor } from "../../../apps/api/src/import-resume/start-import-multipart.interceptor.js";
import {
  createHttpHarness,
  postFile,
  type HarnessOptions,
} from "./start-import-test-harness.js";

const openApps: { close(): Promise<void> }[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("start-import authentication gate", () => {
  it("runs the verified-principal guard before the multipart interceptor", async () => {
    const multipart = vi.spyOn(
      StartImportMultipartInterceptor.prototype,
      "intercept",
    );
    const harness = await trackedHarness({ principal: "none" });
    const filename = "private-candidate-resume.pdf";
    const secretContent = "private candidate content";
    const response = await postFile(harness.baseUrl, {
      filename,
      content: secretContent,
      headers: {
        "X-User-Id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        Authorization: "Bearer header.payload.signature",
        "X-User-Email": "candidate@example.test",
        Cookie: "user=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "X-Authenticated-User": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      statusCode: 401,
      code: "authentication_required",
      message: "Sign in before uploading a resume.",
    });
    expect(multipart).not.toHaveBeenCalled();
    expect(harness.storage.writeObject).not.toHaveBeenCalled();
    expect(harness.limits.reserveAttempt).not.toHaveBeenCalled();
    expect(harness.transactionRunner.transaction).not.toHaveBeenCalled();
    expect(harness.repository.createImportAggregate).not.toHaveBeenCalled();
    expect(harness.storageObjects.size).toBe(0);
    const publicAndLogs = JSON.stringify({ body, logs: harness.logs });
    expect(publicAndLogs).not.toContain(filename);
    expect(publicAndLogs).not.toContain(secretContent);
    expect(publicAndLogs).not.toContain("candidate@example.test");
  });

  it("returns the same privacy-safe 401 for a malformed verified context", async () => {
    const multipart = vi.spyOn(
      StartImportMultipartInterceptor.prototype,
      "intercept",
    );
    const harness = await trackedHarness({ principal: "malformed" });
    const response = await postFile(harness.baseUrl, {
      filename: "malformed-context.pdf",
      content: "must never be retained",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      statusCode: 401,
      code: "authentication_required",
      message: "Sign in before uploading a resume.",
    });
    expect(multipart).not.toHaveBeenCalled();
    expect(harness.storageObjects.size).toBe(0);
    expect(harness.storage.writeObject).not.toHaveBeenCalled();
    expect(harness.limits.reserveAttempt).not.toHaveBeenCalled();
    expect(harness.repository.createImportAggregate).not.toHaveBeenCalled();
  });
});

async function trackedHarness(options: HarnessOptions) {
  const harness = await createHttpHarness(options);
  openApps.push(harness.app);
  return harness;
}
