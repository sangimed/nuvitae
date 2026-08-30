"use client";

import { useEffect } from "react";
const messageType = "nuvitae:codex-connection-complete";

export default function CodexOAuthCallbackPage() {
  useEffect(() => {
    const outcome =
      new URLSearchParams(window.location.search).get("codex") === "connected"
        ? "connected"
        : "attention";
    if (window.opener !== null) {
      window.opener.postMessage(
        { type: messageType, outcome },
        window.location.origin,
      );
      window.close();
      return;
    }
    window.location.replace(`/import-resume?codex=${outcome}`);
  }, []);

  return <p>Finishing your Codex connection…</p>;
}
