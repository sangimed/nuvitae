"use client";

import { useRef, useState } from "react";
import { ErrorSummary } from "../import-resume/ErrorSummary";
import { beginCodexConnection } from "../../services/import-resume/codex-connection-client";

export function CodexConnectionScreen(props: {
  readonly onInitiateConnection?: typeof beginCodexConnection;
  readonly onNavigate?: (authorizationUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const inFlight = useRef(false);
  const initiate = props.onInitiateConnection ?? beginCodexConnection;

  async function connect() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    const outcome = await initiate();
    if (outcome.ok) {
      if (props.onNavigate === undefined) {
        window.location.assign(outcome.response.authorizationUrl);
      } else {
        props.onNavigate(outcome.response.authorizationUrl);
      }
      return;
    }
    inFlight.current = false;
    setBusy(false);
    setError(outcome.message);
  }

  return (
    <section
      className="guidance-panel"
      aria-labelledby="codex-connection-title"
    >
      <h2 id="codex-connection-title">Connect Codex before you upload</h2>
      <p>
        Connect Codex so Nuvitae can organize your resume. You will review the
        information before anything becomes part of your resume.
      </p>
      <ErrorSummary
        heading="Codex could not be connected"
        errors={
          error === undefined
            ? []
            : [{ id: "codex-connection-error", message: error }]
        }
      />
      <button
        type="button"
        className="primary-action"
        onClick={() => void connect()}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Opening secure connection…" : "Connect Codex"}
      </button>
    </section>
  );
}
