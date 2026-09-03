"use client";

import { useEffect, useRef } from "react";
import { recordCommunityFunnelEvent } from "../services/community-funnel";

export function CommunityFunnelBeacon() {
  const recorded = useRef(false);

  useEffect(() => {
    const record = () => {
      if (recorded.current) return;
      recorded.current = true;
      recordCommunityFunnelEvent({ funnelEvent: "first_run.reached" });
    };
    const controller = new AbortController();
    const authenticatedEvent = "nuvitae:community-authenticated";
    window.addEventListener(authenticatedEvent, record);
    void fetch("/api/community-auth/session/status", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { authenticated?: unknown })
          : undefined,
      )
      .then((status) => {
        if (status?.authenticated === true) record();
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      window.removeEventListener(authenticatedEvent, record);
    };
  }, []);

  return null;
}
