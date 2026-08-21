import {
  attachVerifiedPrincipal,
  type VerifiedPrincipal,
} from "../auth/user-context.js";
import { describe, expect, it, vi } from "vitest";
import { ImportStatusController } from "./import-status.controller.js";
import type { ImportStatusService } from "./import-status.service.js";
import { VerifiedPrincipalGuard } from "../auth/verified-principal.guard.js";

const ownerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const importId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("ImportStatusController", () => {
  it("passes only the guarded principal owner to the status service", async () => {
    const service = {
      readStatus: vi.fn(async () => ({
        version: "2026-07-28",
        requestId,
        importId,
        status: "processing",
        currentStep: "checking_document",
        progressKnown: false,
        allowedRecoveryActions: ["manual_entry"],
        userMessage: "Checking that your document can be imported.",
      })),
    } as unknown as ImportStatusService & {
      readStatus: ReturnType<typeof vi.fn>;
    };
    const request = {};
    attachVerifiedPrincipal(request, principal());
    new VerifiedPrincipalGuard().canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as never);

    const response = await new ImportStatusController(service).status(
      request,
      importId,
    );

    expect(service.readStatus).toHaveBeenCalledWith({
      importId,
      ownerUserId,
      requestId,
    });
    expect(response).toMatchObject({
      status: "processing",
      currentStep: "checking_document",
    });
    expect(JSON.stringify(response)).not.toContain("filename");
    expect(JSON.stringify(response)).not.toContain("storageKey");
  });
});

function principal(): VerifiedPrincipal {
  return {
    verification: "verified",
    userId: ownerUserId,
    requestId,
  };
}
