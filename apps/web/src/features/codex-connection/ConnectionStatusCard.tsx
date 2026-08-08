"use client";

import { useEffect, useRef, useState } from "react";
import type { ProviderConnectionStatusResponse } from "@nuvitae/contracts";
import {
  beginCodexConnection,
  readCodexConnectionStatus,
  type BeginCodexConnectionOutcome,
  type ReadCodexConnectionStatusOutcome,
} from "../../services/import-resume/codex-connection-client";

type VisibleStatus =
  "loading" | "disconnected" | "connecting" | "ready" | "expired";

export function ConnectionStatusCard(props: {
  readonly onInitiateConnection?: typeof beginCodexConnection;
  readonly onReadStatus?: typeof readCodexConnectionStatus;
  readonly onNavigate?: (authorizationUrl: string) => void;
}) {
  const [status, setStatus] = useState<ProviderConnectionStatusResponse>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const connectionAttempted = useRef(false);
  const readStatus = props.onReadStatus ?? readCodexConnectionStatus;
  const initiate = props.onInitiateConnection ?? beginCodexConnection;

  useEffect(() => {
    // T213 component tests inject only initiation; production and T214 tests
    // inject/read the status boundary explicitly. This keeps the handoff-only
    // tests deterministic without suppressing status reads in production.
    if (
      props.onReadStatus === undefined &&
      props.onInitiateConnection !== undefined
    ) {
      return;
    }
    const controller = new AbortController();
    void readStatus({ signal: controller.signal }).then((outcome) => {
      if (controller.signal.aborted) return;
      if (connectionAttempted.current) return;
      if (outcome.ok) {
        setStatus(outcome.response);
        setStatusMessage(undefined);
      } else {
        setStatusMessage(outcome.message);
      }
    });
    return () => controller.abort();
  }, [props.onInitiateConnection, props.onReadStatus, readStatus]);

  const visibleStatus = toVisibleStatus(status);
  const canStart = visibleStatus === "disconnected";

  async function connect() {
    if (inFlight.current || !canStart) return;
    inFlight.current = true;
    connectionAttempted.current = true;
    setBusy(true);
    setStatusMessage(undefined);
    const outcome = await initiate();
    if (outcome.ok) {
      setStatus({
        version: "2026-08-08",
        providerKind: "codex",
        connectionStatus: "login_pending",
        authenticationStatus: "pending",
        availabilityStatus: "unknown",
        ready: false,
        safeMessage: null,
      });
      if (props.onNavigate === undefined) {
        window.location.assign(outcome.response.authorizationUrl);
      } else {
        props.onNavigate(outcome.response.authorizationUrl);
      }
      return;
    }
    inFlight.current = false;
    setBusy(false);
    setStatusMessage(outcome.message);
  }

  return (
    <section
      className="guidance-panel"
      aria-labelledby="codex-connection-title"
      aria-live="polite"
    >
      <h2 id="codex-connection-title">Codex connection</h2>
      {renderStatusMessage(visibleStatus, status)}
      {statusMessage === undefined ? null : (
        <p role="status">{statusMessage}</p>
      )}
      {canStart ? (
        <button
          type="button"
          className="primary-action"
          onClick={() => void connect()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Opening secure connection…" : "Connect Codex"}
        </button>
      ) : null}
    </section>
  );
}

function toVisibleStatus(
  status: ProviderConnectionStatusResponse | undefined,
): VisibleStatus {
  // Unknown status is treated as disconnected for presentation: it is safe
  // to offer connection, but never safe to claim readiness.
  if (status === undefined) return "disconnected";
  if (status.ready) return "ready";
  if (status.connectionStatus === "login_pending") return "connecting";
  if (
    status.connectionStatus === "authentication_expired" ||
    status.connectionStatus === "authentication_revoked" ||
    status.connectionStatus === "connected"
  ) {
    return "expired";
  }
  return "disconnected";
}

function renderStatusMessage(
  status: VisibleStatus,
  response: ProviderConnectionStatusResponse | undefined,
) {
  switch (status) {
    case "loading":
      return <p>Checking your Codex connection.</p>;
    case "disconnected":
      return (
        <p>
          Connect Codex so Nuvitae can organize your resume. You will review the
          information before anything becomes part of your resume.
        </p>
      );
    case "connecting":
      return <p>Connecting Codex. Keep this page open while you finish.</p>;
    case "ready":
      return <p>Codex is ready.</p>;
    case "expired":
      return (
        <p>
          Codex connection expired. Codex needs attention before you can
          continue.
          {response?.safeMessage === null
            ? null
            : ` ${response?.safeMessage ?? ""}`}
        </p>
      );
  }
}

export type { BeginCodexConnectionOutcome, ReadCodexConnectionStatusOutcome };
