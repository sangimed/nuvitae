import { randomUUID } from "node:crypto";
import {
  createPersistenceDataSource,
  TypeOrmImportLimitAttemptsRepository,
  type DataSource,
} from "@nuvitae/persistence";
import {
  ImportLimitService,
  RepositoryBackedImportLimitStore,
  type ImportProcessingLimits,
  type ImportReservationResult,
} from "@nuvitae/import-application";

export interface ControllableClock {
  now(): Date;
  advance(ms: number): void;
  setNow(date: Date): void;
}

export function createControllableClock(
  initialIso = "2026-07-29T09:30:00.000Z",
): ControllableClock {
  let current = new Date(initialIso);
  return {
    now: () => new Date(current.getTime()),
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
    setNow(date: Date) {
      current = new Date(date.getTime());
    },
  };
}

export interface LimitTestContext {
  readonly service: ImportLimitService;
  readonly repository: TypeOrmImportLimitAttemptsRepository;
  readonly clock: ControllableClock;
  readonly dataSource: DataSource;
  readonly ownerA: string;
  readonly ownerB: string;
  readonly limits: ImportProcessingLimits;
  cleanup(): Promise<void>;
}

export const defaultLimits: ImportProcessingLimits = {
  maxUploadSizeBytes: 10 * 1024 * 1024,
  maxRenderedPageCount: 5,
  foregroundTimeoutSeconds: 180,
  parserMemoryLimitMiB: 512,
  maxActiveJobsPerUser: 1,
  maxQueuedJobsPerUser: 2,
  rollingAttemptLimit: 5,
  rollingAttemptWindowSeconds: 10 * 60,
  retryCooldownSeconds: 60,
};

export async function createLimitTestContext(
  database: string,
  schema: string,
  overrides: Partial<ImportProcessingLimits> = {},
): Promise<LimitTestContext> {
  const dataSource = createPersistenceDataSource({
    host: process.env.POSTGRES_HOST ?? "postgres",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER ?? "nuvitae",
    password: process.env.POSTGRES_PASSWORD ?? "nuvitae_dev_password",
    database,
    ssl: false,
    logging: false,
    poolMax: 5,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    schema,
  });

  await dataSource.initialize();
  await dataSource.query(`CREATE SCHEMA "${schema}"`);
  await dataSource.runMigrations();

  const repository = new TypeOrmImportLimitAttemptsRepository(dataSource);
  const limits = { ...defaultLimits, ...overrides };
  const store = new RepositoryBackedImportLimitStore(repository);
  const service = new ImportLimitService(store, limits);
  const clock = createControllableClock();

  return {
    service,
    repository,
    clock,
    dataSource,
    ownerA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    limits,
    async cleanup() {
      await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
      await dataSource.destroy();
    },
  };
}

export async function reserveAttempt(
  ctx: LimitTestContext,
  ownerUserId: string,
): Promise<{
  allowed: boolean;
  reservationId?: string;
  retryAfterSeconds?: number;
}> {
  const result: ImportReservationResult = await ctx.service.reserveAttempt(
    ownerUserId,
    ctx.clock.now(),
  );
  if (result.allowed) {
    return { allowed: true, reservationId: result.reservation.id };
  }
  const retry = result.outcome.retryAfterSeconds;
  return retry === undefined
    ? { allowed: false }
    : { allowed: false, retryAfterSeconds: retry };
}

export async function admitAndEnqueue(
  ctx: LimitTestContext,
  ownerUserId: string,
  attemptId: string,
  importId?: string,
): Promise<{ kind: string; code?: string }> {
  const id = importId ?? randomUUID();
  const result = await ctx.service.admitToQueue(
    ownerUserId,
    attemptId,
    id,
    ctx.clock.now(),
  );
  if (result.kind === "denied") {
    return { kind: "denied", code: result.code };
  }
  return { kind: result.kind };
}

export async function admitToProcessing(
  ctx: LimitTestContext,
  ownerUserId: string,
  importId: string,
): Promise<{ kind: string; code?: string }> {
  const result = await ctx.service.admitToProcessing(
    ownerUserId,
    importId,
    ctx.clock.now(),
  );
  if (result.kind === "denied") {
    return { kind: "denied", code: result.code };
  }
  return { kind: result.kind };
}
