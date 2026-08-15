/**
 * T075 - shared privacy-safe import event vocabulary.
 *
 * This module is the single privacy boundary for resume-import logging. It
 * owns a closed event-name vocabulary and a strict, bounded metadata schema
 * per event. Import code never passes arbitrary objects, raw errors,
 * documents, transcripts, fragments, requests, responses, credentials, or
 * provider payloads to a generic logger: it calls `emitImportEvent` (or an
 * `ImportEventEmitter` created from it) with a validated metadata record.
 *
 * Hostile metadata is handled without executing custom serialization hooks:
 * only own enumerable *data* properties of plain objects are read, accessor
 * properties are never invoked, symbols and nested objects are rejected, and
 * every read is wrapped so sanitization never throws. Sink failures are
 * swallowed so logging can never break an import operation.
 */

export type ImportEventLevel = "info" | "warn";

export interface ImportEventRecord {
  readonly level: ImportEventLevel;
  readonly event: string;
  readonly metadata: Readonly<
    Record<
      string,
      string | number | boolean | null | readonly (string | number)[]
    >
  >;
}

export interface ImportEventSink {
  write(record: ImportEventRecord): void;
}

export interface ImportEventEmitter {
  emit<K extends ImportEventName>(
    event: K,
    metadata: ImportEventMetadataFor<K>,
  ): void;
}

const safeTokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const opaqueIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const maxPathItems = 8;

const documentFormats = ["pdf", "docx"] as const;
const countBuckets = ["0-4", "5-19", "20-99", "100+"] as const;
const sourceFidelityStages = [
  "source_extraction",
  "provider_response",
  "canonical_candidate",
  "draft_field",
  "persisted_field",
  "api_response",
  "rendered_review",
] as const;
const longFormFieldCategories = [
  "summary",
  "work_bullet",
  "project_description",
  "other_descriptive_prose",
] as const;
const sourceCoverageCategories = [
  "unknown",
  "grounded",
  "complete",
  "partial",
  "lost",
] as const;
const sourceFidelityCountBuckets = [
  "unknown",
  "none",
  "under_256",
  "256_to_999",
  "1000_to_3999",
  "4000_plus",
] as const;
const durationBuckets = [
  "under_100ms",
  "under_1s",
  "under_10s",
  "10s_or_more",
] as const;
const pageCountBuckets = [
  "not_known",
  "one",
  "two_to_five",
  "over_limit",
] as const;
const languageCategories = [
  "english",
  "french",
  "bilingual_french_english",
  "unsupported",
  "unknown",
  "not_known",
] as const;
const fileSizeBuckets = ["under_1_mib", "1_to_5_mib", "5_to_10_mib"] as const;
const pdfSafetyReasonCodes = [
  "pdf_javascript_action",
  "pdf_launch_action",
  "pdf_embedded_file",
  "pdf_rich_media",
  "pdf_unsupported_active_content",
  "pdf_unclassified_action",
  "pdf_malformed_active_content",
] as const;

const importResourceOperations = [
  "status",
  "review",
  "confirm",
  "discard",
  "structured_resume",
  "provider_connection",
] as const;

const providerConnectionOperations = [
  "status",
  "connect",
  "complete_login",
  "cancel_login",
  "reconnect",
  "disconnect",
  "revoke",
  "delete",
  "refresh_capabilities",
  "refresh_quota",
  "detect_expired",
] as const;

const providerConnectionFailureCategories = [
  "not_found",
  "deleted",
  "state_conflict",
  "adapter_failed",
  "persistence_failed",
  "session_storage_unavailable",
  "unavailable",
  "rate_limited",
  "quota_exceeded",
] as const;

const validationFailureCategories = [
  "accepted",
  "authentication_required",
  "rate_limited",
  "unsupported_format",
  "unsupported_language",
  "oversized_file",
  "over_page_limit",
  "no_selectable_text",
  "password_protected",
  "malformed_or_corrupted",
  "unsafe_content",
  "mixed_content",
  "no_supported_field",
  "processing_timeout",
  "parser_memory_limit",
  "cancelled",
  "expired",
  "provider_unavailable",
  "terminal_failure",
  "infrastructure_failure",
] as const;

const extractionFailureCategories = [
  "malformed",
  "corrupted",
  "encrypted",
  "password_protected",
  "scanned_or_image_only",
  "unsupported",
  "resource_limit",
  "cancelled",
  "unexpected",
  "source_unavailable",
] as const;

const semanticOutcomes = [
  "provider_unavailable",
  "extraction_failed",
  "cancelled",
  "request_invalid",
  "accepted",
  "v2_success",
  "v2_partial_acceptance",
  "v2_zero_accepted_fields",
  "v2_invalid_envelope",
  "not_configured",
  "disconnected",
  "authentication_expired",
  "authentication_revoked",
  "rate_limited",
  "quota_exceeded",
  "unsupported_capability",
  "timeout",
  "invalid_provider_response",
  "schema_violation",
  "unsupported_contract_version",
  "malformed_flattened_evidence",
  "request_too_large",
  "response_too_large",
  "invalid_grounding",
  "ambiguous_output",
  "conflicting_output",
  "explicit_absence_mismatch",
  "invented_fact",
  "unknown_provider_failure",
  "partial_deterministic_fallback",
] as const;
const semanticTransportTimingPhases = [
  "request_started",
  "response_headers",
  "first_byte",
  "first_semantic_output",
  "sse_started",
  "completion_event",
  "response_eof",
  "request_timeout",
  "first_output_timeout",
  "stream_inactivity_timeout",
  "generation_timeout",
  "cancelled",
  "completed",
  "transport_error",
] as const;
const semanticTransportHttpStatusCategories = [
  "not_observed",
  "2xx",
  "3xx",
  "4xx",
  "5xx",
] as const;
const semanticTransportContentEncodingCategories = [
  "absent",
  "identity",
  "gzip",
  "deflate",
  "br",
  "unsupported",
] as const;
const semanticTransportTransferEncodingCategories = [
  "absent",
  "identity",
  "chunked",
  "other",
] as const;
const semanticTransportByteCountBuckets = [
  "none",
  "small",
  "medium",
  "large",
] as const;
const semanticTransportStructuralTokenCategories = [
  "sse_data",
  "sse_event",
  "json_object",
  "whitespace",
  "unknown",
] as const;
const semanticTransportNewlineCountBuckets = [
  "none",
  "1-4",
  "5-19",
  "20+",
] as const;
const semanticResponseLimitTriggerCategories = [
  "cumulative_raw_sse_limit",
  "buffered_response_body_limit",
  "individual_sse_event_limit",
  "semantic_output_limit",
  "v2_envelope_size_limit",
] as const;
const semanticResponseLimitByteBuckets = [
  "not_observed",
  "0-64k",
  "64k-256k",
  "256k-1m",
  "1m-2m",
  "over_2m",
] as const;
const semanticResponseLimitEventCountBuckets = [
  "0-4",
  "5-19",
  "20-99",
  "100-999",
  "1000-9999",
  "10000-99999",
  "100000-999999",
  "over_999999",
] as const;
const semanticTransportFailureDiagnosticCategories = [
  "none",
  "cumulative_raw_sse_limit",
  "buffered_response_body_limit",
  "individual_sse_event_limit",
  "semantic_output_limit",
  "malformed_protocol",
  "missing_response_completed",
  "request_timeout",
  "first_output_timeout",
  "stream_inactivity_timeout",
  "generation_timeout",
  "cancelled",
] as const;
const semanticResponseLimitSseEventTypes = [
  "response.created",
  "response.in_progress",
  "response.output_text.delta",
  "response.output_text.done",
  "response.output_item.done",
  "response.completed",
  "response.content_part.added",
  "response.content_part.done",
  "response.output_item.added",
  "response.reasoning_summary_part.added",
  "response.reasoning_summary_text.delta",
  "response.reasoning_summary_text.done",
  "response.reasoning_summary_part.done",
  "response.metadata",
  "response.failed",
  "response.incomplete",
  "error",
  "unclassified",
] as const;
const semanticProviderErrorCategories = [
  "authentication_expired",
  "authentication_revoked",
  "rate_limited",
  "quota_exhausted",
  "timeout",
  "provider_unavailable",
  "malformed_provider_output",
  "unknown",
] as const;
const semanticProviderErrorCodeCategories = [
  "expired",
  "revoked",
  "rate_limit",
  "quota",
  "timeout",
  "temporary",
  "internal",
  "unknown",
  "not_present",
] as const;
const semanticProviderErrorShapeCategories = [
  "nested_error_object",
  "flat_error_object",
  "nested_response_error",
  "missing_error_object",
  "malformed_error_object",
] as const;
const semanticV2EnvelopeFailureStages = [
  "semantic_json_parse",
  "v2_envelope",
  "v2_canonicalizer",
] as const;
const semanticV2EnvelopeFailureLevels = ["whole_envelope_unusable"] as const;
const semanticV2UnrecognizedKeyCategories = [
  "none",
  "known_alias_wrong_location",
  "unknown_contact_key",
  "misplaced_existing_semantic_field",
  "unknown_structural_key",
] as const;
const semanticV2EnvelopeFailureCategories = [
  "invalid_json",
  "wrong_root_shape",
  "missing_required_root_field",
  "unexpected_root_field",
  "invalid_section_shape",
  "invalid_candidate_shape",
  "invalid_source_ref_shape",
  "unsupported_typed_value_shape",
  "object_depth_exceeded",
  "atom_limit_exceeded",
  "node_limit_exceeded",
  "response_size_exceeded",
  "cardinality_limit_exceeded",
  "other_schema_violation",
] as const;
const semanticV2FieldFailureLevels = ["field_level_rejection"] as const;
const semanticV2FieldFailureCategories = [
  "invalid_candidate_shape",
  "invalid_source_ref_shape",
  "unsupported_typed_value_shape",
  "other_schema_violation",
] as const;
const semanticV2EnvelopeValueCategories = [
  "not_observed",
  "unparseable",
  "missing",
  "object",
  "array",
  "string",
  "number",
  "boolean",
  "null",
  "other",
] as const;
const semanticV2EnvelopeSchemaVersionCategories = [
  "not_observed",
  "exact_v2",
  "missing",
  "other_string",
  "wrong_type",
] as const;
const semanticV2EnvelopeStructuralReasons = [
  "none",
  "semantic_json_parse",
  "response_size_limit",
  "response_depth_limit",
  "total_atom_limit",
  "total_node_limit",
  "section_cardinality_limit",
  "relationship_cardinality_limit",
  "aggregate_collection_limit",
  "schema_version",
  "top_level_envelope",
  "canonicalizer_exception",
] as const;
const semanticV2EnvelopeSerializedBytesBuckets = [
  "not_observed",
  "0-64k",
  "64k-128k",
  "128k-256k",
  "over_256k",
] as const;
const semanticV2EnvelopeCountBuckets = [
  "0-4",
  "5-19",
  "20-99",
  "100-199",
  "200-499",
  "500-999",
  "1000+",
] as const;

const validationDiagnosticCategories = [
  "schema",
  "evidence",
  "grounding",
  "absence",
  "ambiguity",
  "conflict",
  "no_invention",
  "injection",
  "review",
] as const;

const reviewOperationTypes = [
  "confirm_field",
  "edit_field",
  "remove_field",
  "add_field",
  "complete_missing_field",
  "resolve_warning",
  "exclude_section",
] as const;

const uploadRejectionCategories = [
  "unsupported_format",
  "empty_file",
  "oversized_file",
  "unsafe_upload_metadata",
  "authentication_required",
] as const;

const jobTypes = [
  "validation",
  "extraction",
  "foreground_timeout",
  "unknown",
] as const;

const workerFailureCategories = [
  "invalid_payload",
  "unsupported_job",
  "unexpected_failure",
] as const;

const confirmFailureCategories = [
  "validation_failed",
  "not_found",
  "draft_not_ready",
  "stale_review",
  "expired",
  "lifecycle_not_confirmable",
  "lifecycle_not_discardable",
  "concurrent_confirmation",
  "temporarily_unavailable",
  "unresolved_warnings",
  "no_user_confirmed_field",
  "reviewed_content_not_mappable",
] as const;

const discardFailureCategories = [
  "validation_failed",
  "stale_review",
  "expired",
  "lifecycle_not_discardable",
] as const;

const extractionOutcomeCategories = [
  "complete",
  "partial",
  "no_supported_field",
] as const;

const draftStatuses = ["review_required", "ready_to_confirm"] as const;

type StringField = {
  readonly kind: "string";
  readonly max: number;
  readonly pattern?: RegExp;
  readonly optional?: boolean;
};
type IntField = {
  readonly kind: "int";
  readonly min: number;
  readonly max: number;
  readonly optional?: boolean;
};
type BoolField = {
  readonly kind: "bool";
  readonly optional?: boolean;
};
type EnumField = {
  readonly kind: "enum";
  readonly values: readonly string[];
  readonly optional?: boolean;
};
type PathField = {
  readonly kind: "path";
  readonly optional?: boolean;
};
type TokenListField = {
  readonly kind: "token_list";
  readonly maxItems: number;
  readonly maxItemLength: number;
  readonly optional?: boolean;
};
type SseEventAccountingField = {
  readonly kind: "sse_event_accounting";
  readonly optional?: boolean;
};

type FieldSpec =
  | StringField
  | IntField
  | BoolField
  | EnumField
  | PathField
  | TokenListField
  | SseEventAccountingField;

export interface ImportEventSchema {
  readonly level: ImportEventLevel;
  readonly fields: Readonly<Record<string, FieldSpec>>;
}

const id = (optional = false): StringField => ({
  kind: "string",
  max: 64,
  pattern: opaqueIdentifierPattern,
  optional,
});
const token = (optional = false): StringField => ({
  kind: "string",
  max: 128,
  pattern: safeTokenPattern,
  optional,
});
const int = (min: number, max: number, optional = false): IntField => ({
  kind: "int",
  min,
  max,
  optional,
});
const bool = (optional = false): BoolField => ({
  kind: "bool",
  optional,
});
const enumOf = (values: readonly string[], optional = false): EnumField => ({
  kind: "enum",
  values,
  optional,
});
const path = (optional = false): PathField => ({ kind: "path", optional });
const tokenList = (
  maxItems: number,
  maxItemLength = 128,
  optional = false,
): TokenListField => ({
  kind: "token_list",
  maxItems,
  maxItemLength,
  optional,
});
const sseEventAccounting = (): SseEventAccountingField => ({
  kind: "sse_event_accounting",
});

const commonIdentifierFields = {
  importId: id(true),
  correlationId: id(true),
} as const;

const importTimingPhases = [
  "upload_received",
  "upload_persisted",
  "queue_enqueued",
  "worker_started",
  "validation_completed",
  "extraction_completed",
  "normalization_completed",
  "provider_started",
  "provider_headers",
  "provider_first_output",
  "provider_completed",
  "semantic_parsing_completed",
  "canonicalization_completed",
  "draft_persisted",
  "review_api_available",
  "review_first_poll",
  "review_available_to_client",
  "review_rendered",
] as const;

const importTimingSources = ["api", "worker", "web"] as const;

export const importEventSchemas = {
  "import.timing": {
    level: "info",
    fields: {
      importId: id(),
      correlationId: id(true),
      phase: enumOf(importTimingPhases),
      source: enumOf(importTimingSources),
      timestampMs: int(0, 9_000_000_000_000_000),
      durationMs: int(0, 86_400_000, true),
      elapsedSinceUploadMs: int(0, 86_400_000, true),
    },
  },
  "import.created": {
    level: "info",
    fields: {
      importId: id(),
      statusCode: int(100, 599),
      fileSizeBucket: enumOf(fileSizeBuckets),
      correlationId: id(true),
    },
  },
  "import.upload_rejected": {
    level: "warn",
    fields: {
      errorCategory: enumOf(uploadRejectionCategories),
      ...commonIdentifierFields,
    },
  },
  "import.rate_limited": {
    level: "warn",
    fields: {
      retryAfterSeconds: int(0, 86_400),
      ...commonIdentifierFields,
    },
  },
  "import.active_limit_reached": {
    level: "warn",
    fields: {},
  },
  "import.queued_limit_reached": {
    level: "warn",
    fields: {},
  },
  "import.processing_start_denied": {
    level: "warn",
    fields: {},
  },
  "import.limit_service_failed": {
    level: "warn",
    fields: {},
  },
  "import.storage_write_failed": {
    level: "warn",
    fields: {
      importId: id(),
      retryable: bool(),
      correlationId: id(true),
    },
  },
  "import.storage_read_failed": {
    level: "warn",
    fields: {
      importId: id(),
      retryable: bool(),
      correlationId: id(true),
    },
  },
  "import.storage_delete_failed": {
    level: "warn",
    fields: {
      importId: id(),
      retryable: bool(),
      correlationId: id(true),
    },
  },
  "import.limit_release_failed": {
    level: "warn",
    fields: {
      importId: id(),
      errorCategory: enumOf(["limit_release_failed"]),
      correlationId: id(true),
    },
  },
  "import.limit_rollback_failed": {
    level: "warn",
    fields: {
      errorCategory: enumOf(["limit_rollback_failed"]),
      importId: id(true),
      correlationId: id(true),
    },
  },
  "import.queue_publication_failed": {
    level: "warn",
    fields: {
      importId: id(),
      errorCategory: enumOf(["queue_publication_failed"]),
      correlationId: id(true),
    },
  },
  "import.response_contract_failed": {
    level: "warn",
    fields: {
      importId: id(),
      errorCategory: enumOf(["response_contract_failed"]),
      correlationId: id(true),
    },
  },
  "import.resource_not_found": {
    level: "warn",
    fields: {
      importId: id(),
      operation: enumOf(importResourceOperations),
      correlationId: id(true),
    },
  },
  "import.discarded": {
    level: "info",
    fields: {
      importId: id(),
      deletionJobId: id(),
      requestId: id(true),
    },
  },
  "import.discard_failed": {
    level: "warn",
    fields: {
      importId: id(true),
      draftId: id(true),
      errorCategory: enumOf(discardFailureCategories),
      statusCode: int(100, 599),
      requestId: id(true),
    },
  },
  "import.worker_failed": {
    level: "warn",
    fields: {
      importId: id(),
      jobType: enumOf(jobTypes),
      errorCategory: enumOf(workerFailureCategories),
      retryable: bool(),
      correlationId: id(true),
    },
  },
  "import.unexpected_failure": {
    level: "warn",
    fields: {
      importId: id(),
      errorCategory: enumOf(["unexpected_failure"]),
      retryable: bool(),
      correlationId: id(true),
    },
  },
  "validation.completed": {
    level: "info",
    fields: {
      importId: id(),
      errorCategory: enumOf(validationFailureCategories),
      durationBucket: enumOf(durationBuckets),
      pageCountBucket: enumOf(pageCountBuckets),
      languageCategory: enumOf(languageCategories),
      pdfSafetyReason: enumOf(pdfSafetyReasonCodes, true),
      correlationId: id(true),
    },
  },
  "validation.state_recovery_failed": {
    level: "warn",
    fields: {
      importId: id(),
      errorCategory: enumOf(["state_recovery_failed"]),
      correlationId: id(true),
    },
  },
  "extraction.started": {
    level: "info",
    fields: {
      importId: id(),
      documentFormat: enumOf(documentFormats),
      correlationId: id(true),
    },
  },
  "extraction.completed": {
    level: "info",
    fields: {
      importId: id(),
      documentFormat: enumOf(documentFormats),
      extractionCategory: enumOf(extractionOutcomeCategories),
      fieldCountBucket: enumOf(countBuckets),
      warningCountBucket: enumOf(countBuckets),
      durationBucket: enumOf(durationBuckets),
      correlationId: id(true),
    },
  },
  "extraction.failed": {
    level: "warn",
    fields: {
      importId: id(),
      documentFormat: enumOf(documentFormats),
      extractionCategory: enumOf(extractionFailureCategories),
      retryable: bool(),
      durationBucket: enumOf(durationBuckets),
      correlationId: id(true),
    },
  },
  "extraction.transcript_normalized": {
    level: "info",
    fields: {
      importId: id(),
      documentFormat: enumOf(documentFormats),
      fragmentCountBucket: enumOf(countBuckets),
      lineCountBucket: enumOf(countBuckets),
      correlationId: id(true),
    },
  },
  "review.draft_created": {
    level: "info",
    fields: {
      importId: id(),
      draftId: id(),
      status: enumOf(draftStatuses),
      fieldCountBucket: enumOf(countBuckets),
      warningCountBucket: enumOf(countBuckets),
      correlationId: id(true),
    },
  },
  "review.corrected": {
    level: "info",
    fields: {
      importId: id(),
      operationType: enumOf(reviewOperationTypes),
      reviewRevision: int(0, 1_000_000),
      draftId: id(true),
      requestId: id(true),
    },
  },
  "confirm.completed": {
    level: "info",
    fields: {
      importId: id(),
      draftId: id(true),
      requestId: id(true),
    },
  },
  "confirm.failed": {
    level: "warn",
    fields: {
      importId: id(true),
      draftId: id(true),
      errorCategory: enumOf(confirmFailureCategories),
      statusCode: int(100, 599),
      requestId: id(true),
    },
  },
  "semantic.provider_invocation_started": {
    level: "info",
    fields: {
      importId: id(),
      contractVersion: token(),
      requestContractVersion: token(true),
      responseContractVersion: token(true),
      correlationId: id(true),
    },
  },
  "semantic.provider_transport_timing": {
    level: "info",
    fields: {
      importId: id(),
      phase: enumOf(semanticTransportTimingPhases),
      elapsedMs: int(0, 86_400_000),
      httpStatusCategory: enumOf(semanticTransportHttpStatusCategories),
      firstByteReceived: bool(),
      sseStarted: bool(),
      completionEventReceived: bool(),
      correlationId: id(true),
    },
  },
  "semantic.provider_protocol_shape": {
    level: "info",
    fields: {
      importId: id(),
      contentType: {
        kind: "string",
        max: 256,
      },
      contentTypePresent: bool(),
      contentEncoding: enumOf(semanticTransportContentEncodingCategories),
      transferEncoding: enumOf(semanticTransportTransferEncodingCategories),
      firstChunkByteCountBucket: enumOf(semanticTransportByteCountBuckets),
      firstStructuralTokenCategory: enumOf(
        semanticTransportStructuralTokenCategories,
      ),
      newlineCountBucket: enumOf(semanticTransportNewlineCountBuckets),
      additionalBytesAfterFirstByte: bool(),
      inactivityDurationMs: int(0, 86_400_000),
      eventLinesObserved: bool(),
      eventNames: tokenList(64),
      eventTypes: tokenList(64),
      // sseFrameCount is a reconstructed SSE dispatch count and may include
      // [DONE]; it is independent from the typed-event count.
      sseFrameCount: int(0, 2_097_152),
      dataFieldCount: int(0, 1_048_576),
      multilineDataObserved: bool(),
      doneSentinelObserved: bool(),
      eofObserved: bool(),
      jsonObjectParsed: bool(),
      jsonTopLevelKeys: tokenList(64),
      finalRecognizedEventType: token(true),
      receivedRawBodyBytesBucket: enumOf(semanticResponseLimitByteBuckets),
      assembledSemanticOutputBytesBucket: enumOf(
        semanticResponseLimitByteBuckets,
      ),
      parsedSseEventCount: int(0, 2_097_152),
      parsedSseEventCountBucket: enumOf(semanticResponseLimitEventCountBuckets),
      responseCompletedObserved: bool(),
      sseEventAccounting: sseEventAccounting(),
      transportFailureCategory: enumOf(
        semanticTransportFailureDiagnosticCategories,
      ),
      correlationId: id(true),
    },
  },
  "semantic.provider_sse_error": {
    level: "warn",
    fields: {
      importId: id(),
      providerErrorCategory: enumOf(semanticProviderErrorCategories),
      providerErrorCodeCategory: enumOf(semanticProviderErrorCodeCategories),
      retryable: bool(),
      eventShapeCategory: enumOf(semanticProviderErrorShapeCategories),
      correlationId: id(true),
    },
  },
  "semantic.provider_response_limit": {
    level: "warn",
    fields: {
      importId: id(),
      triggerCategory: enumOf(semanticResponseLimitTriggerCategories),
      receivedRawBodyBytesBucket: enumOf(semanticResponseLimitByteBuckets),
      assembledSemanticOutputBytesBucket: enumOf(
        semanticResponseLimitByteBuckets,
      ),
      parsedSseEventCount: int(0, 2_097_152),
      parsedSseEventCountBucket: enumOf(semanticResponseLimitEventCountBuckets),
      responseCompletedObserved: bool(),
      sseFrameCount: int(0, 2_097_152),
      eventTypes: tokenList(64),
      sseEventAccounting: sseEventAccounting(),
      correlationId: id(true),
    },
  },
  "semantic.provider_v2_envelope_diagnostics": {
    level: "warn",
    fields: {
      importId: id(),
      responseContractVersion: token(),
      semanticJsonParseSucceeded: bool(),
      canonicalizerReached: bool(),
      failureStage: enumOf(semanticV2EnvelopeFailureStages),
      failureLevel: enumOf(semanticV2EnvelopeFailureLevels),
      failureCategory: enumOf(semanticV2EnvelopeFailureCategories),
      topLevelValueCategory: enumOf(semanticV2EnvelopeValueCategories),
      schemaVersionCategory: enumOf(semanticV2EnvelopeSchemaVersionCategories),
      topLevelKeys: tokenList(5),
      missingTopLevelKeys: tokenList(5),
      unexpectedTopLevelKeys: tokenList(14),
      unrecognizedTopLevelKeyPresent: bool(),
      unrecognizedKeyCategory: enumOf(semanticV2UnrecognizedKeyCategories),
      sectionsValueCategory: enumOf(semanticV2EnvelopeValueCategories),
      sectionKeys: tokenList(10),
      missingSectionKeys: tokenList(10),
      unexpectedSectionKeys: tokenList(11),
      unrecognizedSectionKeyPresent: bool(),
      relationshipsValueCategory: enumOf(semanticV2EnvelopeValueCategories),
      ambiguitiesValueCategory: enumOf(semanticV2EnvelopeValueCategories),
      conflictsValueCategory: enumOf(semanticV2EnvelopeValueCategories),
      structuralReason: enumOf(semanticV2EnvelopeStructuralReasons),
      normalizedOutputBytesBucket: enumOf(
        semanticV2EnvelopeSerializedBytesBuckets,
      ),
      serializedResponseBytesBucket: enumOf(
        semanticV2EnvelopeSerializedBytesBuckets,
      ),
      totalAtomCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      totalNodeCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      maxDepthBucket: enumOf(semanticV2EnvelopeCountBuckets),
      maxDepthObserved: int(0, 128),
      workExperienceCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      educationCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      skillsCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      languagesCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      projectsCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      certificationsCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      professionalLinksCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      relationshipCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      ambiguityCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      conflictCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      responseJsonByteLimit: int(1, 10_000_000),
      objectDepthLimit: int(1, 128),
      totalAtomLimit: int(1, 1_000_000),
      totalNodeLimit: int(1, 10_000_000),
      firstZodIssueCode: token(true),
      firstZodPath: tokenList(8),
      issueCountBucket: enumOf(countBuckets),
      correlationId: id(true),
    },
  },
  "semantic.provider_v2_field_diagnostics": {
    level: "warn",
    fields: {
      importId: id(),
      responseContractVersion: token(),
      failureLevel: enumOf(semanticV2FieldFailureLevels),
      failureCategory: enumOf(semanticV2FieldFailureCategories),
      acceptedCandidateCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      rejectedFieldCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      signalCountBucket: enumOf(semanticV2EnvelopeCountBuckets),
      rejectionCategories: tokenList(4),
      firstRejectedPath: path(),
      correlationId: id(true),
    },
  },
  "semantic.outcome": {
    level: "info",
    fields: {
      importId: id(),
      outcome: enumOf(semanticOutcomes),
      retryable: bool(),
      valueCountBucket: enumOf(countBuckets),
      diagnosticCountBucket: enumOf(countBuckets),
      durationBucket: enumOf(durationBuckets),
      correlationId: id(true),
    },
  },
  "semantic.source_fidelity": {
    level: "info",
    fields: {
      importId: id(),
      stage: enumOf(sourceFidelityStages),
      longFormFieldCategory: enumOf(longFormFieldCategories),
      sourceCoverageCategory: enumOf(sourceCoverageCategories),
      sourceRefCountBucket: enumOf([...countBuckets, "unknown"] as const),
      sourceCharacterCountBucket: enumOf(sourceFidelityCountBuckets),
      acceptedCharacterCountBucket: enumOf(sourceFidelityCountBuckets),
      truncationDetected: bool(),
      correlationId: id(true),
    },
  },
  "semantic.validation_diagnostics": {
    level: "warn",
    fields: {
      category: enumOf(validationDiagnosticCategories),
      code: token(),
      retryable: bool(),
      requiresReview: bool(),
      path: path(),
      ...commonIdentifierFields,
    },
  },
  "provider_connection.lookup_failed": {
    level: "warn",
    fields: {
      connectionId: id(),
      operation: enumOf(providerConnectionOperations),
      errorCategory: enumOf(providerConnectionFailureCategories),
      retryable: bool(),
    },
  },
} as const satisfies Record<string, ImportEventSchema>;

export type ImportEventName = keyof typeof importEventSchemas;

export interface ImportEventMetadataMap {
  "import.timing": {
    readonly importId: string;
    readonly correlationId?: string;
    readonly phase: (typeof importTimingPhases)[number];
    readonly source: (typeof importTimingSources)[number];
    readonly timestampMs: number;
    readonly durationMs?: number;
    readonly elapsedSinceUploadMs?: number;
  };
  "import.created": {
    readonly importId: string;
    readonly statusCode: number;
    readonly fileSizeBucket: (typeof fileSizeBuckets)[number];
    readonly correlationId?: string;
  };
  "import.upload_rejected": {
    readonly errorCategory: (typeof uploadRejectionCategories)[number];
    readonly importId?: string;
    readonly correlationId?: string;
  };
  "import.rate_limited": {
    readonly retryAfterSeconds: number;
    readonly importId?: string;
    readonly correlationId?: string;
  };
  "import.active_limit_reached": Record<string, never>;
  "import.queued_limit_reached": Record<string, never>;
  "import.processing_start_denied": Record<string, never>;
  "import.limit_service_failed": Record<string, never>;
  "import.storage_write_failed": {
    readonly importId: string;
    readonly retryable: boolean;
    readonly correlationId?: string;
  };
  "import.storage_read_failed": {
    readonly importId: string;
    readonly retryable: boolean;
    readonly correlationId?: string;
  };
  "import.storage_delete_failed": {
    readonly importId: string;
    readonly retryable: boolean;
    readonly correlationId?: string;
  };
  "import.limit_release_failed": {
    readonly importId: string;
    readonly errorCategory: "limit_release_failed";
    readonly correlationId?: string;
  };
  "import.limit_rollback_failed": {
    readonly errorCategory: "limit_rollback_failed";
    readonly importId?: string;
    readonly correlationId?: string;
  };
  "import.queue_publication_failed": {
    readonly importId: string;
    readonly errorCategory: "queue_publication_failed";
    readonly correlationId?: string;
  };
  "import.response_contract_failed": {
    readonly importId: string;
    readonly errorCategory: "response_contract_failed";
    readonly correlationId?: string;
  };
  "import.resource_not_found": {
    readonly importId: string;
    readonly operation: (typeof importResourceOperations)[number];
    readonly correlationId?: string;
  };
  "import.discarded": {
    readonly importId: string;
    readonly deletionJobId: string;
    readonly requestId?: string;
  };
  "import.discard_failed": {
    readonly importId?: string;
    readonly draftId?: string;
    readonly errorCategory: (typeof discardFailureCategories)[number];
    readonly statusCode: number;
    readonly requestId?: string;
  };
  "import.worker_failed": {
    readonly importId: string;
    readonly jobType: (typeof jobTypes)[number];
    readonly errorCategory: (typeof workerFailureCategories)[number];
    readonly retryable: boolean;
    readonly correlationId?: string;
  };
  "import.unexpected_failure": {
    readonly importId: string;
    readonly errorCategory: "unexpected_failure";
    readonly retryable: boolean;
    readonly correlationId?: string;
  };
  "validation.completed": {
    readonly importId: string;
    readonly errorCategory: (typeof validationFailureCategories)[number];
    readonly durationBucket: (typeof durationBuckets)[number];
    readonly pageCountBucket: (typeof pageCountBuckets)[number];
    readonly languageCategory: (typeof languageCategories)[number];
    readonly pdfSafetyReason?: (typeof pdfSafetyReasonCodes)[number];
    readonly correlationId?: string;
  };
  "validation.state_recovery_failed": {
    readonly importId: string;
    readonly errorCategory: "state_recovery_failed";
    readonly correlationId?: string;
  };
  "extraction.started": {
    readonly importId: string;
    readonly documentFormat: (typeof documentFormats)[number];
    readonly correlationId?: string;
  };
  "extraction.completed": {
    readonly importId: string;
    readonly documentFormat: (typeof documentFormats)[number];
    readonly extractionCategory: (typeof extractionOutcomeCategories)[number];
    readonly fieldCountBucket: (typeof countBuckets)[number];
    readonly warningCountBucket: (typeof countBuckets)[number];
    readonly durationBucket: (typeof durationBuckets)[number];
    readonly correlationId?: string;
  };
  "extraction.failed": {
    readonly importId: string;
    readonly documentFormat: (typeof documentFormats)[number];
    readonly extractionCategory: (typeof extractionFailureCategories)[number];
    readonly retryable: boolean;
    readonly durationBucket: (typeof durationBuckets)[number];
    readonly correlationId?: string;
  };
  "extraction.transcript_normalized": {
    readonly importId: string;
    readonly documentFormat: (typeof documentFormats)[number];
    readonly fragmentCountBucket: (typeof countBuckets)[number];
    readonly lineCountBucket: (typeof countBuckets)[number];
    readonly correlationId?: string;
  };
  "review.draft_created": {
    readonly importId: string;
    readonly draftId: string;
    readonly status: (typeof draftStatuses)[number];
    readonly fieldCountBucket: (typeof countBuckets)[number];
    readonly warningCountBucket: (typeof countBuckets)[number];
    readonly correlationId?: string;
  };
  "review.corrected": {
    readonly importId: string;
    readonly operationType: (typeof reviewOperationTypes)[number];
    readonly reviewRevision: number;
    readonly draftId?: string;
    readonly requestId?: string;
  };
  "confirm.completed": {
    readonly importId: string;
    readonly draftId?: string;
    readonly requestId?: string;
  };
  "confirm.failed": {
    readonly importId?: string;
    readonly draftId?: string;
    readonly errorCategory: (typeof confirmFailureCategories)[number];
    readonly statusCode: number;
    readonly requestId?: string;
  };
  "semantic.provider_invocation_started": {
    readonly importId: string;
    readonly contractVersion: string;
    readonly requestContractVersion?: string;
    readonly responseContractVersion?: string;
    readonly correlationId?: string;
  };
  "semantic.provider_transport_timing": {
    readonly importId: string;
    readonly phase: (typeof semanticTransportTimingPhases)[number];
    readonly elapsedMs: number;
    readonly httpStatusCategory: (typeof semanticTransportHttpStatusCategories)[number];
    readonly firstByteReceived: boolean;
    readonly sseStarted: boolean;
    readonly completionEventReceived: boolean;
    readonly correlationId?: string;
  };
  "semantic.provider_protocol_shape": {
    readonly importId: string;
    readonly contentType: string;
    readonly contentTypePresent: boolean;
    readonly contentEncoding: (typeof semanticTransportContentEncodingCategories)[number];
    readonly transferEncoding: (typeof semanticTransportTransferEncodingCategories)[number];
    readonly firstChunkByteCountBucket: (typeof semanticTransportByteCountBuckets)[number];
    readonly firstStructuralTokenCategory: (typeof semanticTransportStructuralTokenCategories)[number];
    readonly newlineCountBucket: (typeof semanticTransportNewlineCountBuckets)[number];
    readonly additionalBytesAfterFirstByte: boolean;
    readonly inactivityDurationMs: number;
    readonly eventLinesObserved: boolean;
    readonly eventNames: readonly string[];
    readonly eventTypes: readonly string[];
    readonly sseFrameCount: number;
    readonly dataFieldCount: number;
    readonly multilineDataObserved: boolean;
    readonly doneSentinelObserved: boolean;
    readonly eofObserved: boolean;
    readonly jsonObjectParsed: boolean;
    readonly jsonTopLevelKeys: readonly string[];
    readonly finalRecognizedEventType?: string;
    readonly receivedRawBodyBytesBucket: (typeof semanticResponseLimitByteBuckets)[number];
    readonly assembledSemanticOutputBytesBucket: (typeof semanticResponseLimitByteBuckets)[number];
    readonly parsedSseEventCount: number;
    readonly parsedSseEventCountBucket: (typeof semanticResponseLimitEventCountBuckets)[number];
    readonly responseCompletedObserved: boolean;
    readonly sseEventAccounting: readonly string[];
    readonly transportFailureCategory: (typeof semanticTransportFailureDiagnosticCategories)[number];
    readonly correlationId?: string;
  };
  "semantic.provider_sse_error": {
    readonly importId: string;
    readonly providerErrorCategory: (typeof semanticProviderErrorCategories)[number];
    readonly providerErrorCodeCategory: (typeof semanticProviderErrorCodeCategories)[number];
    readonly retryable: boolean;
    readonly eventShapeCategory: (typeof semanticProviderErrorShapeCategories)[number];
    readonly correlationId?: string;
  };
  "semantic.provider_response_limit": {
    readonly importId: string;
    readonly triggerCategory: (typeof semanticResponseLimitTriggerCategories)[number];
    readonly receivedRawBodyBytesBucket: (typeof semanticResponseLimitByteBuckets)[number];
    readonly assembledSemanticOutputBytesBucket: (typeof semanticResponseLimitByteBuckets)[number];
    readonly parsedSseEventCount: number;
    readonly parsedSseEventCountBucket: (typeof semanticResponseLimitEventCountBuckets)[number];
    readonly responseCompletedObserved: boolean;
    readonly sseFrameCount: number;
    readonly eventTypes: readonly string[];
    readonly sseEventAccounting: readonly string[];
    readonly correlationId?: string;
  };
  "semantic.provider_v2_envelope_diagnostics": {
    readonly importId: string;
    readonly responseContractVersion: string;
    readonly semanticJsonParseSucceeded: boolean;
    readonly canonicalizerReached: boolean;
    readonly failureStage: (typeof semanticV2EnvelopeFailureStages)[number];
    readonly failureLevel: (typeof semanticV2EnvelopeFailureLevels)[number];
    readonly failureCategory: (typeof semanticV2EnvelopeFailureCategories)[number];
    readonly topLevelValueCategory: (typeof semanticV2EnvelopeValueCategories)[number];
    readonly schemaVersionCategory: (typeof semanticV2EnvelopeSchemaVersionCategories)[number];
    readonly topLevelKeys: readonly string[];
    readonly missingTopLevelKeys: readonly string[];
    readonly unexpectedTopLevelKeys: readonly string[];
    readonly unrecognizedTopLevelKeyPresent: boolean;
    readonly unrecognizedKeyCategory: (typeof semanticV2UnrecognizedKeyCategories)[number];
    readonly sectionsValueCategory: (typeof semanticV2EnvelopeValueCategories)[number];
    readonly sectionKeys: readonly string[];
    readonly missingSectionKeys: readonly string[];
    readonly unexpectedSectionKeys: readonly string[];
    readonly unrecognizedSectionKeyPresent: boolean;
    readonly relationshipsValueCategory: (typeof semanticV2EnvelopeValueCategories)[number];
    readonly ambiguitiesValueCategory: (typeof semanticV2EnvelopeValueCategories)[number];
    readonly conflictsValueCategory: (typeof semanticV2EnvelopeValueCategories)[number];
    readonly structuralReason: (typeof semanticV2EnvelopeStructuralReasons)[number];
    readonly normalizedOutputBytesBucket: (typeof semanticV2EnvelopeSerializedBytesBuckets)[number];
    readonly serializedResponseBytesBucket: (typeof semanticV2EnvelopeSerializedBytesBuckets)[number];
    readonly totalAtomCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly totalNodeCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly maxDepthBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly maxDepthObserved: number;
    readonly workExperienceCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly educationCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly skillsCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly languagesCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly projectsCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly certificationsCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly professionalLinksCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly relationshipCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly ambiguityCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly conflictCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly responseJsonByteLimit: number;
    readonly objectDepthLimit: number;
    readonly totalAtomLimit: number;
    readonly totalNodeLimit: number;
    readonly firstZodIssueCode?: string;
    readonly firstZodPath: readonly string[];
    readonly issueCountBucket: (typeof countBuckets)[number];
    readonly correlationId?: string;
  };
  "semantic.provider_v2_field_diagnostics": {
    readonly importId: string;
    readonly responseContractVersion: string;
    readonly failureLevel: (typeof semanticV2FieldFailureLevels)[number];
    readonly failureCategory: (typeof semanticV2FieldFailureCategories)[number];
    readonly acceptedCandidateCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly rejectedFieldCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly signalCountBucket: (typeof semanticV2EnvelopeCountBuckets)[number];
    readonly rejectionCategories: readonly string[];
    readonly firstRejectedPath: readonly (string | number)[];
    readonly correlationId?: string;
  };
  "semantic.outcome": {
    readonly importId: string;
    readonly outcome: (typeof semanticOutcomes)[number];
    readonly retryable: boolean;
    readonly valueCountBucket: (typeof countBuckets)[number];
    readonly diagnosticCountBucket: (typeof countBuckets)[number];
    readonly durationBucket: (typeof durationBuckets)[number];
    readonly correlationId?: string;
  };
  "semantic.source_fidelity": {
    readonly importId: string;
    readonly stage: (typeof sourceFidelityStages)[number];
    readonly longFormFieldCategory: (typeof longFormFieldCategories)[number];
    readonly sourceCoverageCategory: (typeof sourceCoverageCategories)[number];
    readonly sourceRefCountBucket: (typeof countBuckets)[number] | "unknown";
    readonly sourceCharacterCountBucket: (typeof sourceFidelityCountBuckets)[number];
    readonly acceptedCharacterCountBucket: (typeof sourceFidelityCountBuckets)[number];
    readonly truncationDetected: boolean;
    readonly correlationId?: string;
  };
  "semantic.validation_diagnostics": {
    readonly importId?: string;
    readonly correlationId?: string;
    readonly category: (typeof validationDiagnosticCategories)[number];
    readonly code: string;
    readonly retryable: boolean;
    readonly requiresReview: boolean;
    readonly path: readonly (string | number)[];
  };
  "provider_connection.lookup_failed": {
    readonly connectionId: string;
    readonly operation: (typeof providerConnectionOperations)[number];
    readonly errorCategory: (typeof providerConnectionFailureCategories)[number];
    readonly retryable: boolean;
  };
}

export type ImportEventMetadataFor<K extends ImportEventName> =
  ImportEventMetadataMap[K];

export type ImportTimingPhase = (typeof importTimingPhases)[number];
export type ImportTimingSource = (typeof importTimingSources)[number];

export interface ImportTimingPoint {
  readonly importId: string;
  readonly correlationId?: string | undefined;
  readonly phase: ImportTimingPhase;
  readonly source: ImportTimingSource;
  readonly at: Date;
  readonly durationMs?: number | undefined;
  readonly uploadReceivedAt?: Date | undefined;
}

/**
 * Emits one canonical, wall-clock timestamp for a stage. Durations are
 * bounded local measurements; cross-service totals are reconstructed from the
 * timestamps and import/correlation id rather than from process-relative
 * clocks. No source content or provider material is accepted here.
 */
export function emitImportTiming(
  emitter: ImportEventEmitter,
  point: ImportTimingPoint,
): void {
  const timestamp = point.at.getTime();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) return;
  const elapsedSinceUploadMs =
    point.uploadReceivedAt === undefined
      ? undefined
      : boundedDuration(timestamp - point.uploadReceivedAt.getTime());
  emitter.emit("import.timing", {
    importId: point.importId,
    phase: point.phase,
    source: point.source,
    timestampMs: timestamp,
    ...(point.correlationId === undefined
      ? {}
      : { correlationId: point.correlationId }),
    ...(point.durationMs === undefined
      ? {}
      : { durationMs: boundedDuration(point.durationMs) }),
    ...(elapsedSinceUploadMs === undefined ? {} : { elapsedSinceUploadMs }),
  });
}

function boundedDuration(value: number): number {
  return Number.isFinite(value)
    ? Math.min(86_400_000, Math.max(0, Math.round(value)))
    : 0;
}

export function emitImportEvent(
  sink: ImportEventSink,
  event: ImportEventName,
  metadata: unknown,
): void {
  const schema = importEventSchemas[event];
  if (schema === undefined) return;
  let record: Readonly<
    Record<
      string,
      string | number | boolean | null | readonly (string | number)[]
    >
  >;
  try {
    const built = buildRecord(schema, metadata);
    if (built === null) return;
    record = Object.freeze(built);
  } catch {
    return;
  }
  try {
    sink.write(
      Object.freeze({
        level: schema.level,
        event,
        metadata: record,
      }),
    );
  } catch {
    // Logging failures must never break the import operation.
  }
}

export function createImportEventEmitter(
  sink: ImportEventSink,
): ImportEventEmitter {
  return {
    emit(event, metadata) {
      emitImportEvent(sink, event, metadata);
    },
  };
}

export function serializeSemanticValidationDiagnostic(
  diagnostic: {
    readonly category: string;
    readonly code: string;
    readonly path: readonly (string | number)[];
    readonly retryable: boolean;
    readonly requiresReview: boolean;
  },
  identifiers: {
    readonly importId?: string | null;
    readonly correlationId?: string | null;
  } = {},
): ImportEventMetadataFor<"semantic.validation_diagnostics"> {
  const metadata: ImportEventMetadataFor<"semantic.validation_diagnostics"> = {
    category: diagnostic.category as never,
    code: diagnostic.code,
    retryable: diagnostic.retryable,
    requiresReview: diagnostic.requiresReview,
    path: [...diagnostic.path],
    ...(identifiers.importId === undefined || identifiers.importId === null
      ? {}
      : { importId: identifiers.importId }),
    ...(identifiers.correlationId === undefined ||
    identifiers.correlationId === null
      ? {}
      : { correlationId: identifiers.correlationId }),
  };
  return metadata;
}

function buildRecord(
  schema: ImportEventSchema,
  metadata: unknown,
): Readonly<
  Record<
    string,
    string | number | boolean | null | readonly (string | number)[]
  >
> | null {
  const source = extractPlainRecord(metadata);
  if (source === null) return null;
  const record: Record<
    string,
    string | number | boolean | null | readonly (string | number)[]
  > = {};
  for (const [key, spec] of Object.entries(schema.fields)) {
    const present = Object.prototype.hasOwnProperty.call(source, key);
    if (!present) {
      if (spec.optional !== true) return null;
      continue;
    }
    const value = source[key];
    const normalized = normalizeField(spec, value);
    if (normalized === INVALID) return null;
    record[key] = normalized;
  }
  return record;
}

const INVALID = Symbol("invalid-import-event-field");

function normalizeField(
  spec: FieldSpec,
  value: unknown,
):
  | string
  | number
  | boolean
  | null
  | readonly (string | number)[]
  | typeof INVALID {
  switch (spec.kind) {
    case "string":
      return normalizeString(spec, value);
    case "int":
      return normalizeInt(spec, value);
    case "bool":
      return typeof value === "boolean" ? value : INVALID;
    case "enum":
      return typeof value === "string" && spec.values.includes(value)
        ? value
        : INVALID;
    case "path":
      return normalizePath(value);
    case "token_list":
      return normalizeTokenList(spec, value);
    case "sse_event_accounting":
      return normalizeSseEventAccounting(value);
  }
}

function normalizeSseEventAccounting(
  value: unknown,
): readonly string[] | typeof INVALID {
  const items = extractArray(value, semanticResponseLimitSseEventTypes.length);
  if (
    items === null ||
    items.length !== semanticResponseLimitSseEventTypes.length
  )
    return INVALID;
  const normalized: string[] = [];
  for (const [
    index,
    eventType,
  ] of semanticResponseLimitSseEventTypes.entries()) {
    const item = items[index];
    if (typeof item !== "string") return INVALID;
    const match =
      /^([_a-z.]+):(\d{1,7}):(not_observed|0-64k|64k-256k|256k-1m|1m-2m|over_2m)$/u.exec(
        item,
      );
    if (
      match === null ||
      match[1] !== eventType ||
      !semanticResponseLimitByteBuckets.includes(match[3] as never)
    )
      return INVALID;
    normalized.push(item);
  }
  return normalized;
}

function normalizeTokenList(
  spec: TokenListField,
  value: unknown,
): readonly string[] | typeof INVALID {
  const items = extractArray(value, spec.maxItems);
  if (items === null) return INVALID;
  const normalized: string[] = [];
  for (const item of items) {
    if (
      typeof item !== "string" ||
      item.length > spec.maxItemLength ||
      !safeTokenPattern.test(item)
    )
      return INVALID;
    normalized.push(item);
  }
  return normalized;
}

function normalizeString(
  spec: StringField,
  value: unknown,
): string | typeof INVALID {
  if (typeof value !== "string") return INVALID;
  if (value.length > spec.max) return INVALID;
  if (spec.pattern !== undefined && !spec.pattern.test(value)) return INVALID;
  return value;
}

function normalizeInt(spec: IntField, value: unknown): number | typeof INVALID {
  if (typeof value !== "number" || !Number.isInteger(value)) return INVALID;
  if (value < spec.min || value > spec.max) return INVALID;
  return value;
}

function normalizePath(
  value: unknown,
): readonly (string | number)[] | typeof INVALID {
  const items = extractArray(value, maxPathItems);
  if (items === null) return INVALID;
  const normalized: (string | number)[] = [];
  for (const item of items) {
    if (typeof item === "number") {
      if (!Number.isInteger(item) || item < 0 || item > 1_000_000)
        return INVALID;
      normalized.push(item);
      continue;
    }
    if (typeof item !== "string") return INVALID;
    if (item.length > 64 || !safeTokenPattern.test(item)) return INVALID;
    normalized.push(item);
  }
  return normalized;
}

function extractPlainRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (
    value instanceof Date ||
    value instanceof Error ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Uint8Array ||
    (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
  ) {
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;

  let descriptors: Record<string, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || descriptor.enumerable !== true) continue;
    if ("get" in descriptor || "set" in descriptor) continue;
    record[key] = descriptor.value;
  }
  return record;
}

function extractArray(value: unknown, maxItems: number): unknown[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      "get" in descriptor ||
      "set" in descriptor
    ) {
      return null;
    }
    items.push(descriptor.value);
  }
  return items;
}
