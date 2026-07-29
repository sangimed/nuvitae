import "reflect-metadata";
import type { INestApplication, Provider } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ImportAggregate,
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import { vi } from "vitest";
import { attachVerifiedPrincipal } from "../../../apps/api/src/auth/user-context.js";
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
} from "../../../apps/api/src/import-resume/start-import.tokens.js";
import {
  API_IMPORT_RESUME_REPOSITORY,
  API_PERSISTENCE_TRANSACTION_RUNNER,
} from "../../../apps/api/src/persistence/api-persistence.module.js";

export const verifiedUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const syntheticImportId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const syntheticRequestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export interface HarnessOptions {
  readonly principal?: "none" | "valid" | "malformed";
  readonly maxUploadSizeBytes?: number;
  readonly limitDenial?: {
    readonly code:
      | "IMPORT_ATTEMPT_LIMIT_REACHED"
      | "ACTIVE_IMPORT_JOB_LIMIT_REACHED"
      | "QUEUED_IMPORT_JOB_LIMIT_REACHED"
      | "IMPORT_LIMIT_STATE_UNAVAILABLE";
    readonly retryAfterSeconds: number;
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
    readonly releaseReservation: ReturnType<typeof vi.fn>;
    readonly rollbackReservation: ReturnType<typeof vi.fn>;
  };
  readonly logs: unknown[];
  readonly queuePublisher: { readonly addBulk: ReturnType<typeof vi.fn> };
}> {
  const storageObjects = new Map<string, Uint8Array>();
  const logs: unknown[] = [];
  const repository = {
    createImportAggregate: vi.fn(async (aggregate: ImportAggregate) => {
      if (options.persistenceFailure !== undefined) {
        throw new Error(options.persistenceFailure);
      }
      return aggregate;
    }),
    findImportByOwner: vi.fn(async () => null),
    saveImportLifecycle: vi.fn(async (document: unknown) => document),
  };
  const transactionRunner = {
    transaction: vi.fn(async (work: (manager: never) => Promise<unknown>) =>
      work({} as never),
    ),
  };
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
    reserveAttempt: vi.fn(async () =>
      options.limitDenial === undefined
        ? {
            allowed: true as const,
            reservation: {
              id: "reservation-1",
              ownerUserId: verifiedUserId,
              attemptedAt: new Date("2026-07-29T09:30:00.000Z"),
              state: "reserved" as const,
            },
          }
        : {
            allowed: false as const,
            ...options.limitDenial,
          },
    ),
    releaseReservation: vi.fn(async () => undefined),
    rollbackReservation: vi.fn(async () => undefined),
  };
  const queuePublisher = options.queuePublisher ?? {
    addBulk: vi.fn(async () => undefined),
  };
  const providers: Provider[] = [
    {
      provide: API_IMPORT_RESUME_REPOSITORY,
      useValue: repository as unknown as ImportResumeRepository,
    },
    {
      provide: API_PERSISTENCE_TRANSACTION_RUNNER,
      useValue: transactionRunner as unknown as PersistenceTransactionRunner,
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
        info: (event: string, metadata: unknown) =>
          logs.push({ event, metadata }),
        warn: (event: string, metadata: unknown) =>
          logs.push({ event, metadata }),
      },
    },
    { provide: START_IMPORT_QUEUE_PUBLISHER, useValue: queuePublisher },
  ];
  const moduleRef = await Test.createTestingModule({
    imports: [ImportResumeModule.register({ providers })],
  }).compile();
  const app = moduleRef.createNestApplication();
  if (options.principal === "valid" || options.principal === "malformed") {
    app.use(
      new SyntheticVerifiedPrincipalMiddleware(options.principal).use.bind(
        new SyntheticVerifiedPrincipalMiddleware(options.principal),
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
    transactionRunner,
    storage,
    limits,
    logs,
    queuePublisher,
  };
}

class SyntheticVerifiedPrincipalMiddleware {
  constructor(private readonly mode: "valid" | "malformed") {}

  use(request: object, _response: unknown, next: () => void): void {
    if (this.mode === "valid") {
      attachVerifiedPrincipal(request, {
        verification: "verified",
        userId: verifiedUserId,
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
