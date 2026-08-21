import { apiPath } from "../api-config";

export type ClientImportTimingPhase =
  "review_first_poll" | "review_available_to_client" | "review_rendered";

/**
 * Timing reports contain only an import correlation id, a closed phase name,
 * and a bounded duration. Telemetry failures are intentionally ignored so
 * they cannot change the import or review experience.
 */
export function recordImportTiming(input: {
  readonly importId: string;
  readonly phase: ClientImportTimingPhase;
  readonly durationMs?: number;
  readonly fetchImpl?: typeof fetch;
}): void {
  const fetcher = input.fetchImpl ?? fetch;
  const durationMs =
    input.durationMs === undefined
      ? undefined
      : Math.max(0, Math.min(86_400_000, Math.round(input.durationMs)));
  void fetcher(apiPath(`/import-resume/${input.importId}/timing`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      phase: input.phase,
      ...(durationMs === undefined ? {} : { durationMs }),
    }),
    keepalive: true,
  }).catch(() => undefined);
}
