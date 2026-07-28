export type FixtureDocumentFormat = "pdf" | "docx";
export type FixtureLanguageCategory =
  "english" | "french" | "bilingual_french_english" | "unsupported" | "unknown";
export type FixtureEligibilityOutcome = "eligible" | "ineligible";
export type FixtureExtractionCategory =
  | "complete"
  | "partial"
  | "unsupported_language_contact_preview"
  | "no_supported_field"
  | "validation_failure";
export type FixtureExpectedWarning =
  | "missing"
  | "ambiguous"
  | "conflicting"
  | "duplicate"
  | "low_confidence"
  | "unsupported"
  | "unsafe"
  | "incomplete"
  | "inferred"
  | "partial"
  | "mixed_content"
  | "expired_source";
export type FixtureFailureCategory =
  | "unsupported_language"
  | "oversized_file"
  | "over_page_limit"
  | "malformed_document"
  | "corrupted_document"
  | "password_protected"
  | "image_only_or_scanned"
  | "unsafe_content"
  | "ambiguous_mixed_content"
  | "no_supported_field";
export type FixtureCategory =
  | "pdf"
  | "docx"
  | "french"
  | "english"
  | "bilingual"
  | "partial_extraction"
  | "unsupported_language"
  | "oversized"
  | "over_page_limit"
  | "malformed"
  | "corrupted"
  | "password_protected"
  | "image_only_scanned"
  | "mixed_text_and_image"
  | "hostile"
  | "mixed_resume_unrelated_content"
  | "no_supported_resume_field";

export interface ProvenanceExpectation {
  readonly pdfPageLocation?: boolean;
  readonly pdfBoundingBox?: boolean;
  readonly docxPackagePartLocation?: boolean;
  readonly docxParagraphRunLocation?: boolean;
  readonly sourceLocationRequired: boolean;
}

export interface ResumeImportFixtureManifestEntry {
  readonly id: string;
  readonly futurePath: string;
  readonly categories: readonly FixtureCategory[];
  readonly intendedFormat: FixtureDocumentFormat;
  readonly languageCategory: FixtureLanguageCategory;
  readonly expectedEligibilityOutcome: FixtureEligibilityOutcome;
  readonly expectedExtractionCategory: FixtureExtractionCategory;
  readonly expectedWarnings: readonly FixtureExpectedWarning[];
  readonly expectedFailureCategory?: FixtureFailureCategory;
  readonly mayCreateDraft: boolean;
  readonly manualEntryRecoveryExpected: boolean;
  readonly provenance: ProvenanceExpectation;
}

export const requiredResumeImportFixtureCategories = [
  "pdf",
  "docx",
  "french",
  "english",
  "bilingual",
  "partial_extraction",
  "unsupported_language",
  "oversized",
  "over_page_limit",
  "malformed",
  "corrupted",
  "password_protected",
  "image_only_scanned",
  "mixed_text_and_image",
  "hostile",
  "mixed_resume_unrelated_content",
  "no_supported_resume_field",
] as const satisfies readonly FixtureCategory[];

export const resumeImportFixtureManifest = [
  {
    id: "pdf-english-complete",
    futurePath: "packages/test-fixtures/resume-import/pdf/english-complete.pdf",
    categories: ["pdf", "english"],
    intendedFormat: "pdf",
    languageCategory: "english",
    expectedEligibilityOutcome: "eligible",
    expectedExtractionCategory: "complete",
    expectedWarnings: [],
    mayCreateDraft: true,
    manualEntryRecoveryExpected: false,
    provenance: {
      sourceLocationRequired: true,
      pdfPageLocation: true,
      pdfBoundingBox: true,
    },
  },
  {
    id: "docx-french-complete",
    futurePath:
      "packages/test-fixtures/resume-import/docx/french-complete.docx",
    categories: ["docx", "french"],
    intendedFormat: "docx",
    languageCategory: "french",
    expectedEligibilityOutcome: "eligible",
    expectedExtractionCategory: "complete",
    expectedWarnings: [],
    mayCreateDraft: true,
    manualEntryRecoveryExpected: false,
    provenance: {
      sourceLocationRequired: true,
      docxPackagePartLocation: true,
      docxParagraphRunLocation: true,
    },
  },
  {
    id: "pdf-bilingual-partial",
    futurePath:
      "packages/test-fixtures/resume-import/pdf/bilingual-partial.pdf",
    categories: ["pdf", "bilingual", "partial_extraction"],
    intendedFormat: "pdf",
    languageCategory: "bilingual_french_english",
    expectedEligibilityOutcome: "eligible",
    expectedExtractionCategory: "partial",
    expectedWarnings: ["partial", "missing", "low_confidence"],
    mayCreateDraft: true,
    manualEntryRecoveryExpected: true,
    provenance: {
      sourceLocationRequired: true,
      pdfPageLocation: true,
      pdfBoundingBox: true,
    },
  },
  {
    id: "docx-unsupported-language-contact",
    futurePath:
      "packages/test-fixtures/resume-import/docx/unsupported-language-contact.docx",
    categories: ["docx", "unsupported_language"],
    intendedFormat: "docx",
    languageCategory: "unsupported",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "unsupported_language_contact_preview",
    expectedWarnings: ["unsupported"],
    expectedFailureCategory: "unsupported_language",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: {
      sourceLocationRequired: true,
      docxPackagePartLocation: true,
      docxParagraphRunLocation: true,
    },
  },
  {
    id: "pdf-oversized",
    futurePath: "packages/test-fixtures/resume-import/pdf/oversized.pdf",
    categories: ["pdf", "oversized"],
    intendedFormat: "pdf",
    languageCategory: "english",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "validation_failure",
    expectedWarnings: [],
    expectedFailureCategory: "oversized_file",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
  {
    id: "docx-over-page-limit",
    futurePath:
      "packages/test-fixtures/resume-import/docx/over-page-limit.docx",
    categories: ["docx", "over_page_limit"],
    intendedFormat: "docx",
    languageCategory: "english",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "validation_failure",
    expectedWarnings: [],
    expectedFailureCategory: "over_page_limit",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
  {
    id: "pdf-malformed",
    futurePath: "packages/test-fixtures/resume-import/pdf/malformed.pdf",
    categories: ["pdf", "malformed"],
    intendedFormat: "pdf",
    languageCategory: "unknown",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "validation_failure",
    expectedWarnings: [],
    expectedFailureCategory: "malformed_document",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
  {
    id: "docx-corrupted",
    futurePath: "packages/test-fixtures/resume-import/docx/corrupted.docx",
    categories: ["docx", "corrupted"],
    intendedFormat: "docx",
    languageCategory: "unknown",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "validation_failure",
    expectedWarnings: [],
    expectedFailureCategory: "corrupted_document",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
  {
    id: "pdf-password-protected",
    futurePath:
      "packages/test-fixtures/resume-import/pdf/password-protected.pdf",
    categories: ["pdf", "password_protected"],
    intendedFormat: "pdf",
    languageCategory: "unknown",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "validation_failure",
    expectedWarnings: [],
    expectedFailureCategory: "password_protected",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
  {
    id: "pdf-image-only-scanned",
    futurePath:
      "packages/test-fixtures/resume-import/pdf/image-only-scanned.pdf",
    categories: ["pdf", "image_only_scanned"],
    intendedFormat: "pdf",
    languageCategory: "unknown",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "validation_failure",
    expectedWarnings: [],
    expectedFailureCategory: "image_only_or_scanned",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
  {
    id: "pdf-mixed-text-image",
    futurePath: "packages/test-fixtures/resume-import/pdf/mixed-text-image.pdf",
    categories: ["pdf", "mixed_text_and_image", "partial_extraction"],
    intendedFormat: "pdf",
    languageCategory: "english",
    expectedEligibilityOutcome: "eligible",
    expectedExtractionCategory: "partial",
    expectedWarnings: ["partial", "missing"],
    mayCreateDraft: true,
    manualEntryRecoveryExpected: true,
    provenance: {
      sourceLocationRequired: true,
      pdfPageLocation: true,
      pdfBoundingBox: true,
    },
  },
  {
    id: "docx-hostile",
    futurePath: "packages/test-fixtures/resume-import/docx/hostile.docx",
    categories: ["docx", "hostile"],
    intendedFormat: "docx",
    languageCategory: "english",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "validation_failure",
    expectedWarnings: ["unsafe"],
    expectedFailureCategory: "unsafe_content",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
  {
    id: "pdf-mixed-resume-unrelated-separable",
    futurePath:
      "packages/test-fixtures/resume-import/pdf/mixed-resume-unrelated-separable.pdf",
    categories: ["pdf", "mixed_resume_unrelated_content"],
    intendedFormat: "pdf",
    languageCategory: "english",
    expectedEligibilityOutcome: "eligible",
    expectedExtractionCategory: "partial",
    expectedWarnings: ["mixed_content", "partial"],
    mayCreateDraft: true,
    manualEntryRecoveryExpected: true,
    provenance: {
      sourceLocationRequired: true,
      pdfPageLocation: true,
      pdfBoundingBox: true,
    },
  },
  {
    id: "docx-mixed-resume-unrelated-ambiguous",
    futurePath:
      "packages/test-fixtures/resume-import/docx/mixed-resume-unrelated-ambiguous.docx",
    categories: ["docx", "mixed_resume_unrelated_content"],
    intendedFormat: "docx",
    languageCategory: "english",
    expectedEligibilityOutcome: "ineligible",
    expectedExtractionCategory: "validation_failure",
    expectedWarnings: ["mixed_content"],
    expectedFailureCategory: "ambiguous_mixed_content",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
  {
    id: "pdf-no-supported-field",
    futurePath:
      "packages/test-fixtures/resume-import/pdf/no-supported-field.pdf",
    categories: ["pdf", "no_supported_resume_field"],
    intendedFormat: "pdf",
    languageCategory: "english",
    expectedEligibilityOutcome: "eligible",
    expectedExtractionCategory: "no_supported_field",
    expectedWarnings: ["unsupported"],
    expectedFailureCategory: "no_supported_field",
    mayCreateDraft: false,
    manualEntryRecoveryExpected: true,
    provenance: { sourceLocationRequired: false },
  },
] as const satisfies readonly ResumeImportFixtureManifestEntry[];
