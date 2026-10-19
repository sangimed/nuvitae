import type { DerivedExtractionArtifact } from "@nuvitae/domain";
import type { ImportEventEmitter } from "./observability/import-events.js";

export type SourceDeletionClaim =
  | { readonly kind: "not_found" }
  | { readonly kind: "already_deleted"; readonly deletedAt: Date }
  | {
      readonly kind: "claimed";
      readonly storageKeys: readonly string[];
    };

export interface SourceDeletionRepository {
  transaction<T>(
    work: (repository: SourceDeletionRepository) => Promise<T>,
  ): Promise<T>;
  claimSourceDeletion(
    importId: string,
    ownerUserId: string,
  ): Promise<SourceDeletionClaim>;
  completeSourceDeletion(
    importId: string,
    ownerUserId: string,
    deletedAt: Date,
  ): Promise<void>;
  failSourceDeletion(importId: string, ownerUserId: string): Promise<void>;
  findImportIdByStructuredResumeAndOwner(
    structuredResumeId: string,
    ownerUserId: string,
  ): Promise<string | null>;
}

export interface SourceDeletionStorage {
  deleteObject(key: string): Promise<{ readonly deleted: boolean }>;
}

export type SourceDeletionResult =
  | { readonly kind: "not_found" }
  | { readonly kind: "deleted"; readonly deletedAt: Date }
  | { readonly kind: "failed" };

/** Deletes private source bytes before irreversibly reducing persisted provenance. */
export class SourceDeletionService {
  constructor(
    private readonly repository: SourceDeletionRepository,
    private readonly storage: SourceDeletionStorage,
    private readonly events?: ImportEventEmitter,
  ) {}

  async delete(input: {
    readonly importId: string;
    readonly ownerUserId: string;
    readonly now: Date;
    readonly queueJobId?: string;
    readonly deliveryId?: string;
    readonly retryOrdinal?: number;
  }): Promise<SourceDeletionResult> {
    const claim = await this.repository.transaction((repository) =>
      repository.claimSourceDeletion(input.importId, input.ownerUserId),
    );
    if (claim.kind === "not_found") return claim;
    if (claim.kind === "already_deleted") {
      return { kind: "deleted", deletedAt: claim.deletedAt };
    }

    try {
      for (const key of new Set(claim.storageKeys)) {
        await this.storage.deleteObject(key);
      }
      await this.repository.transaction((repository) =>
        repository.completeSourceDeletion(
          input.importId,
          input.ownerUserId,
          input.now,
        ),
      );
      return { kind: "deleted", deletedAt: input.now };
    } catch {
      this.events?.emit("import.storage_delete_failed", {
        importId: input.importId,
        retryable: true,
        ...(input.queueJobId === undefined
          ? {}
          : { queueJobId: input.queueJobId }),
        ...(input.deliveryId === undefined
          ? {}
          : { deliveryId: input.deliveryId }),
        ...(input.retryOrdinal === undefined
          ? {}
          : { retryOrdinal: input.retryOrdinal }),
      });
      await this.repository
        .transaction((repository) =>
          repository.failSourceDeletion(input.importId, input.ownerUserId),
        )
        .catch(() => undefined);
      return { kind: "failed" };
    }
  }
}

export function sourceReconstructingStorageKeys(
  sourceKey: string | undefined,
  artifacts: readonly DerivedExtractionArtifact[],
): readonly string[] {
  return [
    ...(sourceKey === undefined ? [] : [sourceKey]),
    ...artifacts
      .filter(
        (artifact) =>
          artifact.containsSourceReconstructingData &&
          artifact.deletionStatus !== "deleted",
      )
      .map((artifact) => artifact.storageKey),
  ];
}
