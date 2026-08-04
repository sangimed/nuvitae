import type { ProviderCapabilitySnapshot } from "@nuvitae/domain";
import type { EntityManager } from "typeorm";

export interface ProviderCapabilitySnapshotsRepository {
  createSnapshot(
    snapshot: ProviderCapabilitySnapshot,
    manager?: EntityManager,
  ): Promise<ProviderCapabilitySnapshot>;
  findSnapshotByAttemptAndOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ProviderCapabilitySnapshot | null>;
}
