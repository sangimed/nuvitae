import type { SemanticParserValidationStatus } from "@nuvitae/domain";
import type { EntityManager } from "typeorm";

export interface SemanticParserValidationStatusRepository {
  createValidationStatus(
    status: SemanticParserValidationStatus,
    manager?: EntityManager,
  ): Promise<SemanticParserValidationStatus>;
  findValidationStatusByAttemptAndOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SemanticParserValidationStatus | null>;
}
