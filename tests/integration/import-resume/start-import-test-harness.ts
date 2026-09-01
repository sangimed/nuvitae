import "reflect-metadata";
import type { INestApplication, Provider } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ImportWorkflowAggregate,
  ImportWorkflowRepository,
} from "@nuvitae/import-application";
import { vi } from "vitest";
import { attachVerifiedPrincipal } from "../../../apps/api/src/auth/user-context.js";
import type { DeniedImportLimitOutcome } from "@nuvitae/import-application";
import { documentedImportProcessingDefaults } from "../../../apps/api/src/config/import-processing-limits.js";
import { ImportResumeModule } from "../../../apps/api/src/import-resume/import-resume.module.js";
import {
  START_IMPORT_CLOCK,
  START_IMPORT_ID_GENERATOR,
  START_IMPORT_LIMIT_SERVICE,
  START_IMPORT_PRIVACY_LOGGER,
  START_IMPORT_PRIVATE_STORAGE,
  START_IMPORT_PROCESSING_LIMITS,
  START_IMPORT_REQUEST_ID_GENERATOR,
  START_IMPORT_QUEUE_PUBLISHER,
} from "../../../apps/api/src/import-resume/ports/tokens.js";
import {
  API_IMPORT_CONFIRMATION_REPOSITORY,
  API_IMPORT_RESUME_REPOSITORY,
  API_IMPORT_REVIEW_REPOSITORY,
  API_SOURCE_DELETION_REPOSITORY,
  API_START_IMPORT_REPOSITORY,
} from "../../../apps/api/src/persistence/api-persistence.module.js";
import { IMPORT_STATUS_QUEUE_READER } from "../../../apps/api/src/import-resume/ports/tokens.js";

export const verifiedUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const syntheticImportId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const syntheticRequestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export interface HarnessOptions {
  readonly principal?: "none" | "valid" | "malformed";
  readonly principalUserId?: string;
  readonly maxUploadSizeBytes?: number;
  readonly limitDenial?:
    | {
        readonly outcome: DeniedImportLimitOutcome;
      }
    | {
        readonly denialForPrincipal: (
          ownerUserId: string,
        ) => DeniedImportLimitOutcome | undefined;
      };
  readonly storageFailure?: string;
  readonly persistenceFailure?: string;
  readonly queuePublisher?: {
    readonly addBulk: ReturnType<typeof vi.fn>;
  };
}

export async function createHttpHarness(options: HarnessOptions = {}): Promise<{
  readonly app: INestApplication;
  readonly baseUrl: string;
  readonly storageObjects: Map<string, Uint8Array>;
  readonly repository: {
    readonly createImportAggregate: ReturnType<typeof vi.fn>;
  };
  readonly transactionRunner: {
    readonly transaction: ReturnType<typeof vi.fn>;
  };
  readonly storage: {
    readonly writeObject: ReturnType<typeof vi.fn>;
    readonly deleteObject: ReturnType<typeof vi.fn>;
  };
  readonly limits: {
    readonly reserveAttempt: ReturnType<typeof vi.fn>;
    readonly admitToQueue: ReturnType<typeof vi.fn>;
    readonly releaseReservation: ReturnType<typeof vi.fn>;
    readonly rollbackReservation: ReturnType<typeof vi.fn>;
  };
  readonly logs: unknown[];
  readonly queuePublisher: { readonly addBulk: ReturnType<typeof vi.fn> };
}> {
  const storageObjects = new Map<string, Uint8Array>();
  const logs: unknown[] = [];
  const repository = {
    createImportAggregate: vi.fn(async (aggregate: ImportWorkflowAggregate) => {
      if (options.persistenceFailure !== undefined) {
        throw new Error(options.persistenceFailure);
      }
      return aggregate;
    }),
    findImportByOwner: vi.fn(async () => null),
    saveImportLifecycle: vi.fn(async (document: unknown) => document),
  };
  const transaction = vi.fn();
  Object.assign(repository, { transaction });
  transaction.mockImplementation(
    async (work: (repository: ImportWorkflowRepository) => Promise<unknown>) =>
      work(repository as unknown as ImportWorkflowRepository),
  );
  const storage = {
    writeObject: vi.fn(async (key: string, content: Uint8Array) => {
      if (options.storageFailure !== undefined) {
        throw new Error(options.storageFailure);
      }
      storageObjects.set(key, Uint8Array.from(content));
    }),
    deleteObject: vi.fn(async (key: string) => ({
      deleted: storageObjects.delete(key),
    })),
  };
  const limits = {
    reserveAttempt: vi.fn(async (ownerUserId: string) => {
      if (options.limitDenial === undefined) {
        return {
          allowed: true as const,
          reservation: {
            id: "reservation-1",
            ownerUserId,
            attemptedAt: new Date("2026-07-29T09:30:00.000Z"),
            importId: null,
            state: "reserved" as const,
          },
        };
      }
      const outcome =
        "outcome" in options.limitDenial
          ? options.limitDenial.outcome
          : options.limitDenial.denialForPrincipal(ownerUserId);
      if (outcome === undefined) {
        return {
          allowed: true as const,
          reservation: {
            id: "reservation-1",
            ownerUserId,
            attemptedAt: new Date("2026-07-29T09:30:00.000Z"),
            importId: null,
            state: "reserved" as const,
          },
        };
      }
      return { allowed: false as const, outcome };
    }),
    admitToQueue: vi.fn(async () => ({ kind: "allowed" as const })),
    releaseReservation: vi.fn(async () => undefined),
    rollbackReservation: vi.fn(async () => undefined),
  };
  const queuePublisher = options.queuePublisher ?? {
    addBulk: vi.fn(async () => undefined),
  };
  const providers: Provider[] = [
    {
      provide: API_IMPORT_RESUME_REPOSITORY,
      useValue: repository as unknown as ImportWorkflowRepository,
    },
    {
      provide: API_IMPORT_REVIEW_REPOSITORY,
      useValue: repository as unknown as ImportWorkflowRepository,
    },
    {
      provide: API_IMPORT_CONFIRMATION_REPOSITORY,
      useValue: repository as unknown as ImportWorkflowRepository,
    },
    {
      provide: API_START_IMPORT_REPOSITORY,
      useValue: repository as unknown as ImportWorkflowRepository,
    },
    { provide: START_IMPORT_PRIVATE_STORAGE, useValue: storage },
    { provide: START_IMPORT_LIMIT_SERVICE, useValue: limits },
    {
      provide: START_IMPORT_PROCESSING_LIMITS,
      useValue: {
        ...documentedImportProcessingDefaults,
        maxUploadSizeBytes:
          options.maxUploadSizeBytes ??
          documentedImportProcessingDefaults.maxUploadSizeBytes,
      },
    },
    {
      provide: START_IMPORT_CLOCK,
      useValue: {
        now: () => new Date("2026-07-29T09:30:00.000Z"),
      },
    },
    {
      provide: START_IMPORT_ID_GENERATOR,
      useValue: { nextId: () => syntheticImportId },
    },
    {
      provide: START_IMPORT_REQUEST_ID_GENERATOR,
      useValue: { nextRequestId: () => syntheticRequestId },
    },
    {
      provide: START_IMPORT_PRIVACY_LOGGER,
      useValue: {
        emit: (event: string, metadata: unknown) =>
          logs.push({ event, metadata }),
      },
    },
    { provide: START_IMPORT_QUEUE_PUBLISHER, useValue: queuePublisher },
    {
      provide: IMPORT_STATUS_QUEUE_READER,
      useValue: { getJob: vi.fn(async () => undefined) },
    },
    { provide: API_SOURCE_DELETION_REPOSITORY, useValue: {} },
  ];
  const moduleRef = await Test.createTestingModule({
    imports: [ImportResumeModule.register({ providers })],
  }).compile();
  const app = moduleRef.createNestApplication();
  if (options.principal === "valid" || options.principal === "malformed") {
    app.use(
      new SyntheticVerifiedPrincipalMiddleware(
        options.principal,
        options.principalUserId,
      ).use.bind(
        new SyntheticVerifiedPrincipalMiddleware(
          options.principal,
          options.principalUserId,
        ),
      ),
    );
  }
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as {
    readonly port: number;
  };
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    storageObjects,
    repository,
    transactionRunner: { transaction },
    storage,
    limits,
    logs,
    queuePublisher,
  };
}

class SyntheticVerifiedPrincipalMiddleware {
  constructor(
    private readonly mode: "valid" | "malformed",
    private readonly principalUserId?: string,
  ) {}

  use(request: object, _response: unknown, next: () => void): void {
    if (this.mode === "valid") {
      attachVerifiedPrincipal(request, {
        verification: "verified",
        userId: this.principalUserId ?? verifiedUserId,
      });
    } else {
      attachVerifiedPrincipal(request, {
        verification: "verified",
        userId: "malformed-user",
      } as never);
    }
    next();
  }
}

export async function postFile(
  baseUrl: string,
  options: {
    readonly filename?: string;
    readonly contentType?: string;
    readonly content?: Uint8Array | string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly includeFile?: boolean;
    readonly secondFile?: boolean;
  } = {},
): Promise<Response> {
  const form = new FormData();
  if (options.includeFile !== false) {
    const content = options.content ?? "synthetic resume bytes";
    form.append(
      "file",
      new Blob(
        [
          content instanceof Uint8Array
            ? (new Uint8Array(content).buffer as ArrayBuffer)
            : content,
        ],
        {
          type: options.contentType ?? "application/pdf",
        },
      ),
      options.filename ?? "resume.pdf",
    );
  }
  if (options.secondFile === true) {
    form.append(
      "file",
      new Blob(["second file"], { type: "application/pdf" }),
      "second.pdf",
    );
  }
  return fetch(`${baseUrl}/import-resume`, {
    method: "POST",
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    body: form,
  });
}
