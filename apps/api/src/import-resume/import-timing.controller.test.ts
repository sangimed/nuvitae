import {
  attachVerifiedPrincipal,
  type VerifiedPrincipal,
} from "../auth/user-context.js";
import { describe, expect, it, vi } from "vitest";
import { ImportTimingController } from "./import-timing.controller.js";
import { VerifiedPrincipalGuard } from "./verified-principal.guard.js";

const ownerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const importId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ImportTimingController", () => {
  it("records only the closed client timing payload", async () => {
    const repository = {
      findImportByOwner: vi.fn(async () => ({ document: {}, artifacts: [] })),
    };
    const logger = { emit: vi.fn() };
    const request = {};
    attachVerifiedPrincipal(request, principal());
    new VerifiedPrincipalGuard().canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as never);

    await new ImportTimingController(repository as never, logger as never, {
      now: () => new Date("2026-08-12T10:00:01.000Z"),
    }).report(request, importId, {
      phase: "review_rendered",
      durationMs: 125,
    });

    expect(repository.findImportByOwner).toHaveBeenCalledWith(
      importId,
      ownerUserId,
    );
    expect(logger.emit).toHaveBeenCalledWith("import.timing", {
      importId,
      correlationId: importId,
      phase: "review_rendered",
      source: "web",
      timestampMs: Date.parse("2026-08-12T10:00:01.000Z"),
      durationMs: 125,
    });
    expect(JSON.stringify(logger.emit.mock.calls)).not.toContain("contents");
  });

  it("ignores malformed timing payloads without persistence access", async () => {
    const repository = { findImportByOwner: vi.fn() };
    const logger = { emit: vi.fn() };
    const request = {};
    attachVerifiedPrincipal(request, principal());
    new VerifiedPrincipalGuard().canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as never);

    await new ImportTimingController(repository as never, logger as never, {
      now: () => new Date(),
    }).report(request, importId, {
      phase: "review_rendered",
      durationMs: -1,
      content: "resume contents must never be accepted",
    });

    expect(repository.findImportByOwner).not.toHaveBeenCalled();
    expect(logger.emit).not.toHaveBeenCalled();
  });
});

function principal(): VerifiedPrincipal {
  return {
    verification: "verified",
    userId: ownerUserId,
    requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  };
}
