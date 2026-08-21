import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  manualDraftResponseSchema,
  type ManualDraftResponse,
} from "@nuvitae/contracts";
import type { ManualStructuredResumeDraft } from "@nuvitae/domain";
import type { ImportResumeRepository } from "@nuvitae/persistence";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachVerifiedPrincipal } from "../../../apps/api/src/auth/user-context.js";
import { CreateManualResumeDraftService } from "../../../apps/api/src/manual-resume/create-manual-resume-draft.service.js";
import { GetManualResumeDraftService } from "../../../apps/api/src/manual-resume/get-manual-resume-draft.service.js";
import { ManualResumeDraftsController } from "../../../apps/api/src/manual-resume/manual-resume-drafts.controller.js";
import { ManualResumeExceptionFilter } from "../../../apps/api/src/manual-resume/manual-resume-exception.filter.js";
import {
  MANUAL_RESUME_CLOCK,
  MANUAL_RESUME_ID_GENERATOR,
  MANUAL_RESUME_REQUEST_ID_GENERATOR,
} from "../../../apps/api/src/manual-resume/manual-resume.tokens.js";
import { UpdateManualResumeDraftService } from "../../../apps/api/src/manual-resume/update-manual-resume-draft.service.js";
import type { ManualResumeDraftRepository } from "../../../apps/api/src/manual-resume/manual-resume.repository.js";
import { VerifiedPrincipalGuard } from "../../../apps/api/src/auth/verified-principal.guard.js";
import {
  API_IMPORT_RESUME_REPOSITORY,
  API_MANUAL_RESUME_DRAFT_REPOSITORY,
} from "../../../apps/api/src/persistence/api-persistence.module.js";

const ownerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondDraftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const firstDraftId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const requestId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("manual resume draft creation contract", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates a blank owner-scoped editing draft without import records or jobs", async () => {
    const harness = await createManualHarness({ principal: "valid" });
    app = harness.app;

    const response = await postManual(harness.baseUrl, "manual-key-0000001");
    expect(response.status).toBe(201);
    const body = manualDraftResponseSchema.parse(await response.json());

    expect(body.version).toBe("2026-07-28");
    expect(body.requestId).toBe(requestId);
    expect(body.draft.draftId).toBe(firstDraftId);
    expect(body.draft.source).toBe("manual_entry");
    expect(body.draft.status).toBe("editing");
    expect(body.draft.content.personal).toEqual([]);
    expect(body.draft.content.contact).toEqual([]);
    expect(body.draft.content.headline).toBeUndefined();
    expect(body.draft.content.summary).toBeUndefined();
    expect(body.draft.content.workExperiences).toEqual([]);
    expect(body.draft.content.education).toEqual([]);
    expect(body.draft.content.skills).toEqual([]);
    expect(body.draft.content.languages).toEqual([]);
    expect(body.draft.content.projects).toEqual([]);
    expect(body.draft.content.certifications).toEqual([]);
    expect(body.draft.content.professionalLinks).toEqual([]);
    expect(body.draft).not.toHaveProperty("importedDocumentId");
    expect(body.draft).not.toHaveProperty("importDraftId");
    expect(body.draft).not.toHaveProperty("sourceStorageKey");
    expect(body.draft).not.toHaveProperty("queueJobId");
    expect(body.draft).not.toHaveProperty("retentionExpiresAt");
    expect(
      harness.importRepository.createImportAggregate,
    ).not.toHaveBeenCalled();
    expect(harness.importRepository.saveDraft).not.toHaveBeenCalled();
    expect(harness.importRepository.scheduleDeletionJob).not.toHaveBeenCalled();
    expect(harness.queuePublisher.addBulk).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests and identity-like headers alone", async () => {
    const unauthenticated = await createManualHarness({ principal: "none" });
    app = unauthenticated.app;
    expect(
      (await postManual(unauthenticated.baseUrl, "manual-key-0000001")).status,
    ).toBe(401);
    await app.close();

    const headerOnly = await createManualHarness({ principal: "none" });
    app = headerOnly.app;
    const response = await postManual(
      headerOnly.baseUrl,
      "manual-key-0000001",
      {
        "x-user-id": ownerUserId,
        "x-authenticated-user-id": ownerUserId,
      },
    );
    expect(response.status).toBe(401);
  });

  it("returns the same draft for the same idempotency key and a new draft for a different key", async () => {
    const harness = await createManualHarness({ principal: "valid" });
    app = harness.app;

    const first = manualDraftResponseSchema.parse(
      await (await postManual(harness.baseUrl, "manual-key-0000001")).json(),
    );
    const repeat = manualDraftResponseSchema.parse(
      await (await postManual(harness.baseUrl, "manual-key-0000001")).json(),
    );
    const different = manualDraftResponseSchema.parse(
      await (await postManual(harness.baseUrl, "manual-key-0000002")).json(),
    );

    expect(repeat.draft.draftId).toBe(first.draft.draftId);
    expect(different.draft.draftId).toBe(secondDraftId);
  });

  it("rejects malformed idempotency keys", async () => {
    const harness = await createManualHarness({ principal: "valid" });
    app = harness.app;

    expect((await postManual(harness.baseUrl, "bad key")).status).toBe(400);
    expect((await postManual(harness.baseUrl, "short")).status).toBe(400);
  });

  it("validates every successful response with the strict shared schema", async () => {
    const harness = await createManualHarness({ principal: "valid" });
    app = harness.app;

    const response = await postManual(harness.baseUrl, "manual-key-0000001");
    const body = (await response.json()) as ManualDraftResponse;
    expect(manualDraftResponseSchema.parse(body)).toEqual(body);
    expect(() =>
      manualDraftResponseSchema.parse({ ...body, importJobId: "job-1" }),
    ).toThrow();
  });
});

async function createManualHarness(options: {
  readonly principal: "none" | "valid";
}) {
  const draftsByKey = new Map<string, ManualStructuredResumeDraft>();
  const draftIds = [firstDraftId, secondDraftId];
  const importRepository = {
    createImportAggregate: vi.fn(),
    findImportByOwner: vi.fn(),
    saveImportLifecycle: vi.fn(),
    saveDraft: vi.fn(),
    findDraftByImportAndOwner: vi.fn(),
    findDraftByOwner: vi.fn(),
    saveStructuredResume: vi.fn(),
    findStructuredResumeByOwner: vi.fn(),
    scheduleDeletionJob: vi.fn(),
    findDeletionJobByOwner: vi.fn(),
  } satisfies Partial<ImportResumeRepository>;
  const transaction = vi.fn();
  const manualRepository: ManualResumeDraftRepository = {
    transaction,
    createManualDraft: vi.fn(async ({ creationKey, draft }) => {
      draftsByKey.set(creationKey, draft);
      return draft;
    }),
    findManualDraftByOwner: vi.fn(async (draftId, userId) => {
      return (
        [...draftsByKey.values()].find(
          (draft) => draft.id === draftId && draft.ownerUserId === userId,
        ) ?? null
      );
    }),
    findManualDraftByCreationKey: vi.fn(async (creationKey, userId) => {
      const draft = draftsByKey.get(creationKey);
      return draft !== undefined && draft.ownerUserId === userId ? draft : null;
    }),
    saveManualDraft: vi.fn(async (draft) => draft),
  };
  transaction.mockImplementation(
    async (
      work: (repository: ManualResumeDraftRepository) => Promise<unknown>,
    ) => work(manualRepository),
  );
  const queuePublisher = { addBulk: vi.fn() };
  const moduleRef = await Test.createTestingModule({
    controllers: [ManualResumeDraftsController],
    providers: [
      CreateManualResumeDraftService,
      GetManualResumeDraftService,
      UpdateManualResumeDraftService,
      VerifiedPrincipalGuard,
      ManualResumeExceptionFilter,
      {
        provide: API_IMPORT_RESUME_REPOSITORY,
        useValue: importRepository,
      },
      {
        provide: API_MANUAL_RESUME_DRAFT_REPOSITORY,
        useValue: manualRepository,
      },
      {
        provide: MANUAL_RESUME_CLOCK,
        useValue: { now: () => new Date("2026-07-29T09:30:00.000Z") },
      },
      {
        provide: MANUAL_RESUME_ID_GENERATOR,
        useValue: { nextId: () => draftIds.shift() ?? secondDraftId },
      },
      {
        provide: MANUAL_RESUME_REQUEST_ID_GENERATOR,
        useValue: { nextRequestId: () => requestId },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  if (options.principal === "valid") {
    app.use((request: object, _response: unknown, next: () => void) => {
      attachVerifiedPrincipal(request, {
        verification: "verified",
        userId: ownerUserId,
      });
      next();
    });
  }
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { readonly port: number };
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    importRepository,
    queuePublisher,
  };
}

function postManual(
  baseUrl: string,
  creationKey: string,
  headers?: Readonly<Record<string, string>>,
): Promise<Response> {
  return fetch(`${baseUrl}/manual-resume-drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ creationKey }),
  });
}
