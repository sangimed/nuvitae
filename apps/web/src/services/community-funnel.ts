import { apiPath } from "./api-config";

type CommunityFunnelEvent =
  | { readonly funnelEvent: "first_run.reached" }
  | { readonly funnelEvent: "provider_connection.initiated" }
  | { readonly funnelEvent: "provider_connection.ready" }
  | {
      readonly funnelEvent: "provider_connection.failed";
      readonly failureCategory: "initiation_failed" | "status_failed";
    }
  | { readonly funnelEvent: "editor.opened" }
  | { readonly funnelEvent: "preview.used" }
  | { readonly funnelEvent: "pdf_export.succeeded" }
  | {
      readonly funnelEvent: "pdf_export.failed";
      readonly failureCategory:
        "preparation_timeout" | "load_failed" | "print_failed";
    }
  | { readonly funnelEvent: "resume.reopened" };

/**
 * Sends only a closed event and optional bounded failure category. Delivery is
 * best-effort and never changes the product flow. The API decides whether the
 * local, optional product metrics stream is enabled.
 */
export function recordCommunityFunnelEvent(
  event: CommunityFunnelEvent,
  fetchImpl: typeof fetch = fetch,
): void {
  void fetchImpl(apiPath("/community-funnel/events"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => undefined);
}
