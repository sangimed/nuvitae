import type { EvidenceRecord } from "@nuvitae/domain";
import type { EntityManager } from "typeorm";

export interface EvidenceRecordsRepository {
  createEvidenceRecords(
    records: readonly EvidenceRecord[],
    manager?: EntityManager,
  ): Promise<readonly EvidenceRecord[]>;
  findEvidenceByResponseAndOwner(
    responseId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly EvidenceRecord[]>;
}
