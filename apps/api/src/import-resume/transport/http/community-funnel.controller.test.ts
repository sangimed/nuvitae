import { describe, expect, it } from "vitest";
import {
  createImportEventEmitter,
  type ImportEventRecord,
} from "../../../observability/import-events.js";
import { attachVerifiedPrincipal } from "../../../auth/user-context.js";
import { VerifiedPrincipalGuard } from "../../../auth/verified-principal.guard.js";
import { CommunityFunnelController } from "./community-funnel.controller.js";

const ownerUserId = "10000000-0000-4000-8000-000000000001";

describe("CommunityFunnelController", () => {
  it("uses authenticated context without recording owner or hostile metadata", () => {
    const records: ImportEventRecord[] = [];
    const controller = new CommunityFunnelController(
      createImportEventEmitter({ write: (record) => records.push(record) }),
    );
    const request = authenticatedRequest();

    controller.report(request, {
      funnelEvent: "preview.used",
      ownerUserId,
      resumeContent: "private resume content",
      credentials: "private credential",
    });

    expect(records).toEqual([
      {
        level: "info",
        event: "community.funnel",
        metadata: { funnelEvent: "preview.used" },
      },
    ]);
    expect(JSON.stringify(records)).not.toMatch(
      /10000000|private resume|private credential/,
    );
  });

  it("rejects calls without verified owner context", () => {
    const controller = new CommunityFunnelController(
      createImportEventEmitter({ write: () => undefined }),
    );

    expect(() =>
      controller.report({}, { funnelEvent: "editor.opened" }),
    ).toThrow();
  });
});

function authenticatedRequest(): object {
  const request = {};
  attachVerifiedPrincipal(request, {
    verification: "verified",
    userId: ownerUserId,
  });
  new VerifiedPrincipalGuard().canActivate({
    switchToHttp: () => ({ getRequest: () => request }),
  } as never);
  return request;
}
