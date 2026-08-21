import type { ImportInitializationResponse } from "@nuvitae/contracts";
import type {
  DocumentValidationJobPayload,
  ForegroundTimeoutJobPayload,
  DeterministicExtractionJobPayload,
} from "@nuvitae/contracts";
import type {
  ImportLimitOutcome,
  ImportLimitReservation,
  ImportReservationResult,
} from "@nuvitae/import-application";
import type { ImportEventEmitter } from "../../observability/import-events.js";

export interface StartImportClock {
  now(): Date;
}

export interface StartImportIdGenerator {
  nextId(): string;
}

export interface StartImportRequestIdGenerator {
  nextRequestId(): string;
}

export interface StartImportPrivateStorage {
  writeObject(key: string, content: Uint8Array): Promise<void>;
  deleteObject(key: string): Promise<{ readonly deleted: boolean }>;
}

export interface StartImportQueuePublisher {
  addBulk(
    jobs: readonly {
      readonly name: string;
      readonly jobId: string;
      readonly data:
        | DocumentValidationJobPayload
        | DeterministicExtractionJobPayload
        | ForegroundTimeoutJobPayload;
      readonly delay?: number;
    }[],
  ): Promise<void>;
}

export interface StartImportLimitPort {
  reserveAttempt(
    ownerUserId: string,
    now: Date,
  ): Promise<ImportReservationResult>;
  admitToQueue(
    ownerUserId: string,
    attemptId: string,
    importId: string,
    now: Date,
  ): Promise<ImportLimitOutcome>;
  releaseReservation(
    ownerUserId: string,
    reservationId: string,
    now: Date,
  ): Promise<void>;
  rollbackReservation(
    ownerUserId: string,
    reservationId: string,
    now: Date,
  ): Promise<void>;
}

export type StartImportPrivacyLogger = ImportEventEmitter;

export interface BufferedResumeUpload {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Uint8Array;
  readonly truncated?: boolean;
}

export interface StartImportInput {
  readonly ownerUserId: string;
  readonly visibleFilename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
}

export interface DurableStartImportResult {
  readonly response: ImportInitializationResponse;
  readonly reservation: ImportLimitReservation;
}
