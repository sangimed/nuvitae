import { codexConnectionInitiationResponseSchema } from "@nuvitae/contracts";
import { importResumeApiPath } from "./config";

export type BeginCodexConnectionOutcome =
  | {
      readonly ok: true;
      readonly response: ReturnType<
        typeof codexConnectionInitiationResponseSchema.parse
      >;
    }
  | {
      readonly ok: false;
      readonly category:
        | "already_connected"
        | "authentication_required"
        | "temporarily_unavailable";
      readonly message: string;
    };

/**
 * Starts only the server-owned browser handoff. The authorization URL is
 * never written to storage or telemetry; callers should navigate immediately.
 */
export async function beginCodexConnection(
  input: {
    readonly fetchImpl?: typeof fetch;
    readonly signal?: AbortSignal;
  } = {},
): Promise<BeginCodexConnectionOutcome> {
  try {
    const response = await (input.fetchImpl ?? fetch)(
      importResumeApiPath(
        "/import-resume/provider-connections/codex/oauth/start",
      ),
      {
        method: "POST",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (response.status === 401) {
      return {
        ok: false,
        category: "authentication_required",
        message: "Sign in before connecting Codex.",
      };
    }
    if (response.status === 409) {
      return {
        ok: false,
        category: "already_connected",
        message: "Codex is already connected.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        category: "temporarily_unavailable",
        message: "Codex could not be connected right now. Try again later.",
      };
    }
    const parsed = codexConnectionInitiationResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      return {
        ok: false,
        category: "temporarily_unavailable",
        message: "Codex could not be connected right now. Try again later.",
      };
    }
    return { ok: true, response: parsed.data };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        category: "temporarily_unavailable",
        message: "The connection was stopped before it started.",
      };
    }
    return {
      ok: false,
      category: "temporarily_unavailable",
      message: "Codex could not be connected right now. Try again later.",
    };
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
