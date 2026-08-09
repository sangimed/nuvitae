/**
 * T172 - semantic candidates to unconfirmed import draft fields.
 *
 * Canonical implementation lives in `@nuvitae/import-application` so the
 * worker processor (T209) and API service layer (T174) share one mapping
 * without importing API implementation modules from the worker.
 */
export {
  mapSemanticCandidates,
  type CandidateReviewReason,
  type DuplicateCandidate,
  type MappedEvidenceReference,
  type MappedRelationship,
  type RejectedCandidate,
  type RejectedCandidateReason,
  type ReviewRequiredField,
  type SemanticCandidateMappingInput,
  type SemanticCandidateMappingResult,
} from "@nuvitae/import-application";
