import type { DeterministicExtractionOutput } from "./adapters.js";

export interface AiClassifierRequest {
  readonly importId: string;
  readonly deterministicOutput: DeterministicExtractionOutput;
  readonly abortSignal?: AbortSignal;
}

export type AiClassificationSafetySignal =
  | "prompt_injection_or_hidden_instruction_detected"
  | "document_instruction_ignored"
  | "low_confidence_classification"
  | "ambiguous_association";

export interface AiSectionClassification {
  readonly deterministicFactId: string;
  readonly section:
    | "personal"
    | "contact"
    | "headline"
    | "summary"
    | "work_experience"
    | "education"
    | "skills"
    | "languages"
    | "projects"
    | "certifications"
    | "professional_links";
  readonly confidence: "high" | "medium" | "low";
}

export interface AiAssociationClassification {
  readonly deterministicFactId: string;
  readonly associatedDeterministicFactId: string;
  readonly association:
    | "belongs_to_employer"
    | "belongs_to_role"
    | "belongs_to_project"
    | "belongs_to_education";
  readonly confidence: "high" | "medium" | "low";
}

export interface AiClassificationWarning {
  readonly code:
    "ambiguous" | "low_confidence" | "prompt_injection_or_hidden_instruction";
  readonly message: string;
  readonly relatedDeterministicFactIds: readonly string[];
}

export type AiClassifierResult =
  | {
      readonly status: "unavailable";
      readonly reason:
        | "provider_not_configured"
        | "provider_disabled"
        | "provider_unreachable";
      readonly deterministicOperationMayContinue: true;
      readonly classifications: readonly [];
      readonly warnings: readonly [];
      readonly safetySignals: readonly [];
    }
  | {
      readonly status: "classified";
      readonly deterministicOperationMayContinue: true;
      readonly classifications: readonly (
        AiSectionClassification | AiAssociationClassification
      )[];
      readonly warnings: readonly AiClassificationWarning[];
      readonly safetySignals: readonly AiClassificationSafetySignal[];
    };

export interface OptionalAiResumeClassifier {
  classify(request: AiClassifierRequest): Promise<AiClassifierResult>;
}
