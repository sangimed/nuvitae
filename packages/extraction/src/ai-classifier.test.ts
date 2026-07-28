import { describe, expect, it } from "vitest";

import type {
  DeterministicExtractionOutput,
  OptionalAiResumeClassifier,
} from "./index.js";

const deterministicOutput: DeterministicExtractionOutput = {
  importId: "import-1",
  documentFormat: "pdf",
  language: "english",
  facts: [
    {
      id: "fact-1",
      section: "work_experience",
      fieldPath: "work[0].roles[0].title",
      text: "Engineer",
      sourceLocation: {
        kind: "pdf_text_item",
        pageNumber: 1,
        itemIndex: 1,
        readingOrder: 1,
        boundingBox: { x: 1, y: 1, width: 10, height: 5, unit: "pdf_point" },
      },
      confidence: "high",
      readingOrder: 1,
    },
  ],
  warnings: [],
};

describe("optional AI classifier boundary", () => {
  it("lets deterministic operation continue when AI is unavailable", async () => {
    const classifier: OptionalAiResumeClassifier = {
      async classify() {
        return {
          status: "unavailable",
          reason: "provider_not_configured",
          deterministicOperationMayContinue: true,
          classifications: [],
          warnings: [],
          safetySignals: [],
        };
      },
    };

    const result = await classifier.classify({
      importId: "import-1",
      deterministicOutput,
    });

    expect(result.status).toBe("unavailable");
    expect(result.deterministicOperationMayContinue).toBe(true);
    expect(deterministicOutput.facts[0]?.text).toBe("Engineer");
  });

  it("returns classifications without replacing extracted factual values", async () => {
    const classifier: OptionalAiResumeClassifier = {
      async classify() {
        return {
          status: "classified",
          deterministicOperationMayContinue: true,
          classifications: [
            {
              deterministicFactId: "fact-1",
              section: "work_experience",
              confidence: "medium",
            },
          ],
          warnings: [],
          safetySignals: [],
        };
      },
    };

    const result = await classifier.classify({
      importId: "import-1",
      deterministicOutput,
    });

    expect(result.status).toBe("classified");
    expect(result.classifications[0]).not.toHaveProperty("text");
    expect(result.classifications[0]).not.toHaveProperty("replacementValue");
    expect(deterministicOutput.facts[0]?.text).toBe("Engineer");
  });

  it("keeps ambiguity warnings explicit", async () => {
    const classifier: OptionalAiResumeClassifier = {
      async classify() {
        return {
          status: "classified",
          deterministicOperationMayContinue: true,
          classifications: [],
          warnings: [
            {
              code: "ambiguous",
              message: "Review which role this line belongs to.",
              relatedDeterministicFactIds: ["fact-1"],
            },
          ],
          safetySignals: ["prompt_injection_or_hidden_instruction_detected"],
        };
      },
    };

    const result = await classifier.classify({
      importId: "import-1",
      deterministicOutput,
    });

    expect(result).toMatchObject({
      status: "classified",
      warnings: [
        { code: "ambiguous", relatedDeterministicFactIds: ["fact-1"] },
      ],
      safetySignals: ["prompt_injection_or_hidden_instruction_detected"],
    });
  });
});
