import type {
  EvidenceRecord,
  NuvitaeExtractionResponse,
  ProviderCapabilitySnapshot,
  SemanticParseAttempt,
  SemanticParseResultGraph,
  SemanticParserValidationStatus,
} from "@nuvitae/domain";
import { DataSource, EntityManager, In } from "typeorm";
import { EvidenceRecordEntity } from "../entities/evidence-record.entity.js";
import { NuvitaeExtractionResponseEntity } from "../entities/nuvitae-extraction-response.entity.js";
import { ProviderCapabilitySnapshotEntity } from "../entities/provider-capability-snapshot.entity.js";
import { SemanticParseAttemptEntity } from "../entities/semantic-parse-attempt.entity.js";
import { SemanticParserValidationStatusEntity } from "../entities/semantic-parser-validation-status.entity.js";
import {
  evidenceRecordEntity,
  mapEvidenceRecord,
} from "../mappers/evidence-record.mapper.js";
import {
  mapNuvitaeExtractionResponse,
  nuvitaeExtractionResponseEntity,
} from "../mappers/nuvitae-extraction-response.mapper.js";
import {
  mapProviderCapabilitySnapshot,
  providerCapabilitySnapshotEntity,
} from "../mappers/provider-capability-snapshot.mapper.js";
import {
  mapSemanticParseAttempt,
  semanticParseAttemptEntity,
} from "../mappers/semantic-parse-attempt.mapper.js";
import {
  mapSemanticParserValidationStatus,
  semanticParserValidationStatusEntity,
} from "../mappers/semantic-parser-validation-status.mapper.js";
import type { EvidenceRecordsRepository } from "./evidence-records.repository.js";
import type { NuvitaeExtractionResponsesRepository } from "./nuvitae-extraction-responses.repository.js";
import type { ProviderCapabilitySnapshotsRepository } from "./provider-capability-snapshots.repository.js";
import type { SemanticParseAttemptsRepository } from "./semantic-parse-attempts.repository.js";
import type { SemanticParserValidationStatusRepository } from "./semantic-parser-validation-status.repository.js";

export type SemanticParserResultGraphRepositoryError =
  | "semantic_result_graph_attempt_mismatch"
  | "semantic_result_graph_owner_mismatch"
  | "semantic_result_graph_response_mismatch";

export interface SemanticParseResultGraphRepository {
  persistParseResultGraph(
    graph: SemanticParseResultGraph,
    manager?: EntityManager,
  ): Promise<SemanticParseResultGraph>;
  findParseResultGraphByAttemptAndOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SemanticParseResultGraph | null>;
}

export class TypeOrmSemanticParserRepository
  implements
    SemanticParseAttemptsRepository,
    NuvitaeExtractionResponsesRepository,
    EvidenceRecordsRepository,
    ProviderCapabilitySnapshotsRepository,
    SemanticParserValidationStatusRepository,
    SemanticParseResultGraphRepository
{
  constructor(private readonly dataSource: DataSource) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }

  private manager(manager?: EntityManager): EntityManager {
    return manager ?? this.dataSource.manager;
  }

  async createAttempt(
    attempt: SemanticParseAttempt,
    manager?: EntityManager,
  ): Promise<SemanticParseAttempt> {
    const scoped = this.manager(manager);
    await scoped.insert(
      SemanticParseAttemptEntity,
      semanticParseAttemptEntity(attempt),
    );
    return this.findAttemptByOwner(
      attempt.id,
      attempt.ownerUserId,
      scoped,
    ).then((saved) => {
      if (saved === null)
        return Promise.reject(new Error("semantic_parse_attempt_not_found"));
      return saved;
    });
  }

  async findAttemptByOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SemanticParseAttempt | null> {
    const entity = await this.manager(manager).findOneBy(
      SemanticParseAttemptEntity,
      { id: attemptId, ownerUserId: userId },
    );
    return entity === null ? null : mapSemanticParseAttempt(entity);
  }

  async findAttemptsByImportAndOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly SemanticParseAttempt[]> {
    const entities = await this.manager(manager).findBy(
      SemanticParseAttemptEntity,
      { importedDocumentId: importId, ownerUserId: userId },
    );
    return entities
      .sort(
        (left, right) => left.startedAt.getTime() - right.startedAt.getTime(),
      )
      .map(mapSemanticParseAttempt);
  }

  async createResponse(
    response: NuvitaeExtractionResponse,
    manager?: EntityManager,
  ): Promise<NuvitaeExtractionResponse> {
    const scoped = this.manager(manager);
    await scoped.insert(
      NuvitaeExtractionResponseEntity,
      nuvitaeExtractionResponseEntity(response),
    );
    return this.findResponseByOwner(
      response.id,
      response.ownerUserId,
      scoped,
    ).then((saved) => {
      if (saved === null)
        return Promise.reject(
          new Error("nuvitae_extraction_response_not_found"),
        );
      return saved;
    });
  }

  async findResponseByOwner(
    responseId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<NuvitaeExtractionResponse | null> {
    const entity = await this.manager(manager).findOneBy(
      NuvitaeExtractionResponseEntity,
      { id: responseId, ownerUserId: userId },
    );
    return entity === null ? null : mapNuvitaeExtractionResponse(entity);
  }

  async findResponseByAttemptAndOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<NuvitaeExtractionResponse | null> {
    const entity = await this.manager(manager).findOneBy(
      NuvitaeExtractionResponseEntity,
      { semanticParseAttemptId: attemptId, ownerUserId: userId },
    );
    return entity === null ? null : mapNuvitaeExtractionResponse(entity);
  }

  async createEvidenceRecords(
    records: readonly EvidenceRecord[],
    manager?: EntityManager,
  ): Promise<readonly EvidenceRecord[]> {
    const scoped = this.manager(manager);
    if (records.length === 0) return [];
    await scoped.insert(
      EvidenceRecordEntity,
      records.map(evidenceRecordEntity),
    );
    const entities = await scoped.findBy(EvidenceRecordEntity, {
      id: In(records.map((record) => record.id)),
      ownerUserId: records[0]?.ownerUserId ?? "",
    });
    return entities
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .map(mapEvidenceRecord);
  }

  async findEvidenceByResponseAndOwner(
    responseId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly EvidenceRecord[]> {
    const entities = await this.manager(manager).findBy(EvidenceRecordEntity, {
      responseId,
      ownerUserId: userId,
    });
    return entities
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .map(mapEvidenceRecord);
  }

  async createSnapshot(
    snapshot: ProviderCapabilitySnapshot,
    manager?: EntityManager,
  ): Promise<ProviderCapabilitySnapshot> {
    const scoped = this.manager(manager);
    await scoped.insert(
      ProviderCapabilitySnapshotEntity,
      providerCapabilitySnapshotEntity(snapshot),
    );
    return this.findSnapshotByAttemptAndOwner(
      snapshot.semanticParseAttemptId,
      snapshot.ownerUserId,
      scoped,
    ).then((saved) => {
      if (saved === null)
        return Promise.reject(
          new Error("provider_capability_snapshot_not_found"),
        );
      return saved;
    });
  }

  async findSnapshotByAttemptAndOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ProviderCapabilitySnapshot | null> {
    const entity = await this.manager(manager).findOneBy(
      ProviderCapabilitySnapshotEntity,
      { semanticParseAttemptId: attemptId, ownerUserId: userId },
    );
    return entity === null ? null : mapProviderCapabilitySnapshot(entity);
  }

  async createValidationStatus(
    status: SemanticParserValidationStatus,
    manager?: EntityManager,
  ): Promise<SemanticParserValidationStatus> {
    const scoped = this.manager(manager);
    await scoped.insert(
      SemanticParserValidationStatusEntity,
      semanticParserValidationStatusEntity(status),
    );
    return this.findValidationStatusByAttemptAndOwner(
      status.semanticParseAttemptId,
      status.ownerUserId,
      scoped,
    ).then((saved) => {
      if (saved === null)
        return Promise.reject(
          new Error("semantic_parser_validation_status_not_found"),
        );
      return saved;
    });
  }

  async findValidationStatusByAttemptAndOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SemanticParserValidationStatus | null> {
    const entity = await this.manager(manager).findOneBy(
      SemanticParserValidationStatusEntity,
      { semanticParseAttemptId: attemptId, ownerUserId: userId },
    );
    return entity === null ? null : mapSemanticParserValidationStatus(entity);
  }

  async persistParseResultGraph(
    graph: SemanticParseResultGraph,
    manager?: EntityManager,
  ): Promise<SemanticParseResultGraph> {
    assertConsistentGraph(graph);
    const scoped = this.manager(manager);
    await scoped.insert(
      SemanticParseAttemptEntity,
      semanticParseAttemptEntity(graph.attempt),
    );
    await scoped.insert(
      NuvitaeExtractionResponseEntity,
      nuvitaeExtractionResponseEntity(graph.response),
    );
    await scoped.insert(
      ProviderCapabilitySnapshotEntity,
      providerCapabilitySnapshotEntity(graph.capabilitySnapshot),
    );
    await scoped.insert(
      SemanticParserValidationStatusEntity,
      semanticParserValidationStatusEntity(graph.validationStatuses),
    );
    if (graph.evidenceRecords.length > 0) {
      await scoped.insert(
        EvidenceRecordEntity,
        graph.evidenceRecords.map(evidenceRecordEntity),
      );
    }
    const saved = await this.findParseResultGraphByAttemptAndOwner(
      graph.attempt.id,
      graph.attempt.ownerUserId,
      scoped,
    );
    if (saved === null)
      return Promise.reject(new Error("semantic_parse_result_graph_not_found"));
    return saved;
  }

  async findParseResultGraphByAttemptAndOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SemanticParseResultGraph | null> {
    const scoped = this.manager(manager);
    const attempt = await scoped.findOneBy(SemanticParseAttemptEntity, {
      id: attemptId,
      ownerUserId: userId,
    });
    if (attempt === null) return null;
    const [response, snapshot, validationStatuses] = await Promise.all([
      scoped.findOneBy(NuvitaeExtractionResponseEntity, {
        semanticParseAttemptId: attemptId,
        ownerUserId: userId,
      }),
      scoped.findOneBy(ProviderCapabilitySnapshotEntity, {
        semanticParseAttemptId: attemptId,
        ownerUserId: userId,
      }),
      scoped.findOneBy(SemanticParserValidationStatusEntity, {
        semanticParseAttemptId: attemptId,
        ownerUserId: userId,
      }),
    ]);
    if (response === null || snapshot === null || validationStatuses === null)
      return null;
    const evidenceRows = await scoped.findBy(EvidenceRecordEntity, {
      responseId: response.id,
      ownerUserId: userId,
    });
    return {
      attempt: mapSemanticParseAttempt(attempt),
      response: mapNuvitaeExtractionResponse(response),
      capabilitySnapshot: mapProviderCapabilitySnapshot(snapshot),
      validationStatuses: mapSemanticParserValidationStatus(validationStatuses),
      evidenceRecords: evidenceRows
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
        )
        .map(mapEvidenceRecord),
    };
  }
}

function assertConsistentGraph(graph: SemanticParseResultGraph): void {
  const attemptId = graph.attempt.id;
  const ownerUserId = graph.attempt.ownerUserId;
  if (graph.response.semanticParseAttemptId !== attemptId) {
    throw new Error("semantic_result_graph_attempt_mismatch");
  }
  if (graph.capabilitySnapshot.semanticParseAttemptId !== attemptId) {
    throw new Error("semantic_result_graph_attempt_mismatch");
  }
  if (graph.validationStatuses.semanticParseAttemptId !== attemptId) {
    throw new Error("semantic_result_graph_attempt_mismatch");
  }
  if (
    graph.response.ownerUserId !== ownerUserId ||
    graph.capabilitySnapshot.ownerUserId !== ownerUserId ||
    graph.validationStatuses.ownerUserId !== ownerUserId ||
    graph.evidenceRecords.some(
      (record) =>
        record.ownerUserId !== ownerUserId ||
        record.responseId !== graph.response.id,
    )
  ) {
    throw new Error("semantic_result_graph_owner_mismatch");
  }
}
