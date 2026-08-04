import type { SemanticParseAttempt } from "@nuvitae/domain";
import type { EntityManager } from "typeorm";

export interface SemanticParseAttemptsRepository {
  createAttempt(
    attempt: SemanticParseAttempt,
    manager?: EntityManager,
  ): Promise<SemanticParseAttempt>;
  findAttemptByOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SemanticParseAttempt | null>;
  findAttemptsByImportAndOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly SemanticParseAttempt[]>;
}
