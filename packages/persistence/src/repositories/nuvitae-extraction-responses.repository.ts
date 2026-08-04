import type { NuvitaeExtractionResponse } from "@nuvitae/domain";
import type { EntityManager } from "typeorm";

export interface NuvitaeExtractionResponsesRepository {
  createResponse(
    response: NuvitaeExtractionResponse,
    manager?: EntityManager,
  ): Promise<NuvitaeExtractionResponse>;
  findResponseByOwner(
    responseId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<NuvitaeExtractionResponse | null>;
  findResponseByAttemptAndOwner(
    attemptId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<NuvitaeExtractionResponse | null>;
}
