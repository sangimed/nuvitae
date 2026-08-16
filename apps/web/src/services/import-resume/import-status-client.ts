import {
  publicImportStatusResponseSchema,
  type PublicImportStatusResponse,
} from "@nuvitae/contracts";
import { importResumeApiPath } from "./config";

const terminalStatuses = new Set<PublicImportStatusResponse["status"]>([
  "draft_ready",
  "partial_extraction",
  "recoverable_timeout",
  "validation_failure",
  "terminal_processing_failure",
  "authentication_required",
  "not_found",
  "expired",
  "cancelled",
]);

const stepRank = {
  checking_document: 0,
  reading_content: 1,
  organizing_resume_sections: 2,
  preparing_review: 3,
} as const;

export type ImportStatusClientOutcome =
  | { readonly ok: true; readonly response: PublicImportStatusResponse }
  | {
      readonly ok: false;
      readonly category:
        | "authentication_required"
        | "temporarily_unavailable"
        | "unexpected_failure";
      readonly message: string;
    };

export async function readImportStatus(input: {
  readonly importId: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<ImportStatusClientOutcome> {
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(
      importResumeApiPath(`/import-resume/${input.importId}/status`),
      {
        method: "GET",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (response.status === 401) {
      return {
        ok: false,
        category: "authentication_required",
        message: "Sign in to continue this resume import.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        category:
          response.status === 503
            ? "temporarily_unavailable"
            : "unexpected_failure",
        message: "The import status could not be checked safely.",
      };
    }
    const parsed = publicImportStatusResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      return {
        ok: false,
        category: "unexpected_failure",
        message: "The import status response could not be understood safely.",
      };
    }
    return { ok: true, response: parsed.data };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        category: "temporarily_unavailable",
        message: "Status checking was stopped.",
      };
    }
    return {
      ok: false,
      category: "temporarily_unavailable",
      message: "Connection temporarily lost. We will keep checking shortly.",
    };
  }
}

export async function pollImportStatus(input: {
  readonly importId: string;
  readonly signal: AbortSignal;
  readonly onStatus: (status: PublicImportStatusResponse) => void;
  readonly onConnectivityLost?: (message: string) => void;
  readonly onTiming?: (timing: {
    readonly phase: "review_first_poll" | "review_available_to_client";
    readonly durationMs?: number;
  }) => void;
  readonly fetchImpl?: typeof fetch;
  readonly intervalMs?: number;
  readonly maxBackoffMs?: number;
  readonly delay?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const intervalMs = input.intervalMs ?? 1000;
  const maxBackoffMs = input.maxBackoffMs ?? 8000;
  const delay = input.delay ?? abortableDelay;
  let backoffMs = intervalMs;
  let latest: PublicImportStatusResponse | undefined;
  const firstPollStartedAt = performance.now();
  input.onTiming?.({ phase: "review_first_poll" });

  while (!input.signal.aborted) {
    const outcome = await readImportStatus({
      importId: input.importId,
      signal: input.signal,
      ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    });

    if (input.signal.aborted) return;

    if (outcome.ok) {
      backoffMs = intervalMs;
      latest = preserveNonRegressiveStatus(latest, outcome.response);
      input.onStatus(latest);
      if (terminalStatuses.has(latest.status)) {
        if (
          latest.status === "draft_ready" ||
          latest.status === "partial_extraction"
        ) {
          input.onTiming?.({
            phase: "review_available_to_client",
            durationMs: performance.now() - firstPollStartedAt,
          });
        }
        return;
      }
      await delay(intervalMs, input.signal);
      continue;
    }

    input.onConnectivityLost?.(outcome.message);
    if (outcome.category === "authentication_required") return;
    await delay(backoffMs, input.signal);
    backoffMs = Math.min(maxBackoffMs, backoffMs * 2);
  }
}

export function preserveNonRegressiveStatus(
  previous: PublicImportStatusResponse | undefined,
  next: PublicImportStatusResponse,
): PublicImportStatusResponse {
  if (
    previous?.status === "processing" &&
    next.status === "processing" &&
    previous.currentStep !== undefined &&
    next.currentStep !== undefined &&
    stepRank[next.currentStep] < stepRank[previous.currentStep]
  ) {
    return {
      ...next,
      currentStep: previous.currentStep,
      progressKnown: previous.progressKnown,
      ...(previous.progressPercent === undefined
        ? { progressPercent: undefined }
        : { progressPercent: previous.progressPercent }),
      userMessage: previous.userMessage,
    };
  }
  return next;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
