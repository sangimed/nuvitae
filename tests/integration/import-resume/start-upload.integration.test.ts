import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpHarness, postFile } from "./start-import-test-harness.js";

describe("authenticated background import start", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it.each([
    ["pdf", "application/pdf"],
    [
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  ])(
    "durably accepts a supported %s and publishes validation, timeout, and retention deletion",
    async (extension, contentType) => {
      const queuePublisher = { addBulk: vi.fn(async () => undefined) };
      const harness = await createHttpHarness({
        principal: "valid",
        queuePublisher,
      });
      close = () => harness.app.close();

      const response = await postFile(harness.baseUrl, {
        filename: `resume.${extension}`,
        contentType,
        content: "synthetic parser-capable fixture",
      });

      expect(response.status).toBe(201);
      expect(harness.repository.createImportAggregate).toHaveBeenCalledOnce();
      expect(harness.storage.writeObject).toHaveBeenCalledOnce();
      expect(queuePublisher.addBulk).toHaveBeenCalledOnce();
      const firstCall = queuePublisher.addBulk.mock.calls[0] as unknown as [
        readonly {
          name: string;
          jobId: string;
          data: Record<string, unknown>;
        }[],
      ];
      const jobs = firstCall[0];
      expect(jobs.map((job) => job.name)).toEqual([
        "document_validation",
        "foreground_timeout",
        "source_artifact_deletion",
      ]);
      expect(jobs.every((job) => !job.jobId.includes(":"))).toBe(true);
      expect(jobs[0]?.data).not.toHaveProperty("visibleFilename");
      expect(jobs[1]?.data).toMatchObject({ jobType: "foreground_timeout" });
      expect(jobs[2]?.data).toMatchObject({
        jobType: "source_artifact_deletion",
        reason: "retention_deadline",
      });
    },
  );
});
