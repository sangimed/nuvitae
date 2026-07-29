import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseReadinessService } from "./database-readiness.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  function readiness(
    probe = vi.fn().mockResolvedValue(undefined),
  ): DatabaseReadinessService {
    return {
      probe,
    } as unknown as DatabaseReadinessService;
  }

  it("returns process liveness without probing PostgreSQL", () => {
    const databaseReadiness = readiness();
    expect(new HealthController(databaseReadiness).getLiveness()).toEqual({
      service: "api",
      status: "ok",
    });
    expect(databaseReadiness.probe).not.toHaveBeenCalled();
  });

  it("returns readiness only after a successful parameter-free probe", async () => {
    const databaseReadiness = readiness();

    await expect(
      new HealthController(databaseReadiness).getReadiness(),
    ).resolves.toEqual({ service: "api", status: "ok" });
    expect(databaseReadiness.probe).toHaveBeenCalledOnce();
  });

  it("returns a generic 503 when the managed data source is unavailable", async () => {
    const databaseReadiness = readiness(
      vi.fn().mockRejectedValue(new Error("driver secret diagnostics")),
    );

    const request = new HealthController(databaseReadiness).getReadiness();
    await expect(request).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(request).rejects.toMatchObject({
      response: {
        code: "database_unavailable",
        message: "Service is not ready.",
        statusCode: 503,
      },
    });

    const serialized = JSON.stringify(await request.catch((error) => error));
    expect(serialized).not.toContain("driver secret diagnostics");
    expect(serialized).not.toContain("SELECT 1");
  });
});
