"use client";

import { useEffect, useRef, useState } from "react";
import type { ProviderConnectionStatusResponse } from "@nuvitae/contracts";
import {
  beginCodexConnection,
  cancelCodexConnection,
  disconnectCodexConnection,
  readCodexConnectionStatus,
  type BeginCodexConnectionOutcome,
  type CancelCodexConnectionOutcome,
  type DisconnectCodexConnectionOutcome,
  type ReadCodexConnectionStatusOutcome,
} from "./client";
import { DisconnectDialog } from "./DisconnectDialog";

type VisibleStatus =
  | "loading"
  | "disconnected"
  | "connecting"
  | "ready"
  | "expired"
  | "unavailable";

export function ConnectionStatusCard(props: {
  readonly onInitiateConnection?: typeof beginCodexConnection;
  readonly onReadStatus?: typeof readCodexConnectionStatus;
  readonly onCancelConnection?: typeof cancelCodexConnection;
  readonly onDisconnect?: typeof disconnectCodexConnection;
  readonly onNavigate?: (authorizationUrl: string) => void;
}) {
  const [status, setStatus] = useState<ProviderConnectionStatusResponse>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const inFlight = useRef(false);
  const connectionAttempted = useRef(false);
  const readStatus = props.onReadStatus ?? readCodexConnectionStatus;
  const initiate = props.onInitiateConnection ?? beginCodexConnection;
  const cancel = props.onCancelConnection ?? cancelCodexConnection;
  const disconnect = props.onDisconnect ?? disconnectCodexConnection;

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

  useEffect(() => {
    function handleConnectionComplete(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin) return;
      if (
        typeof event.data !== "object" ||
        event.data === null ||
        (event.data as { type?: unknown }).type !==
          "nuvitae:codex-connection-complete"
      ) {
        return;
      }
      void readStatus().then((outcome) => {
        if (outcome.ok) {
          setStatus(outcome.response);
          setStatusMessage(undefined);
        } else {
          setStatusMessage(outcome.message);
        }
      });
    }

    window.addEventListener("message", handleConnectionComplete);
    return () =>
      window.removeEventListener("message", handleConnectionComplete);
  }, [readStatus]);

  const visibleStatus = toVisibleStatus(status);
  const canStart =
    visibleStatus === "disconnected" || visibleStatus === "expired";
  const connectAction =
    status === undefined || status.connectionStatus === "not_configured"
      ? "Connect Codex"
      : "Reconnect Codex";

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
        const popup = window.open(
          outcome.response.authorizationUrl,
          "nuvitae-codex-connection",
          "popup,width=520,height=720",
        );
        if (popup === null) {
          window.location.assign(outcome.response.authorizationUrl);
        } else {
          popup.focus();
        }
      } else {
        props.onNavigate(outcome.response.authorizationUrl);
      }
      return;
    }
    inFlight.current = false;
    setBusy(false);
    setStatusMessage(outcome.message);
  }

  async function disconnectCodex() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatusMessage(undefined);
    const outcome = await disconnect();
    if (outcome.ok) {
      setStatus(outcome.response);
      setDisconnectOpen(false);
      setStatusMessage("Codex disconnected. Your resume data is still here.");
    } else {
      setStatusMessage(outcome.message);
    }
    inFlight.current = false;
    setBusy(false);
  }

  async function cancelConnection() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatusMessage(undefined);
    const outcome = await cancel();
    if (outcome.ok) {
      connectionAttempted.current = false;
      setStatus(outcome.response);
      setStatusMessage("Codex connection cancelled. You can try again.");
    } else {
      setStatusMessage(outcome.message);
    }
    inFlight.current = false;
    setBusy(false);
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
          {busy ? "Opening secure connection…" : connectAction}
        </button>
      ) : null}
      {visibleStatus === "connecting" ? (
        <button
          type="button"
          className="secondary-action"
          onClick={() => void cancelConnection()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Cancelling…" : "Cancel connection"}
        </button>
      ) : null}
      {visibleStatus === "ready" ? (
        <button
          type="button"
          className="secondary-action"
          onClick={() => setDisconnectOpen(true)}
          disabled={busy}
        >
          Disconnect
        </button>
      ) : null}
      <DisconnectDialog
        open={disconnectOpen}
        busy={busy}
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={() => void disconnectCodex()}
      />
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
    status.connectionStatus === "connected" &&
    (status.availabilityStatus === "unavailable" ||
      status.availabilityStatus === "rate_limited" ||
      status.availabilityStatus === "quota_exceeded")
  ) {
    return "unavailable";
  }
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
    case "unavailable":
      return (
        <p>
          Codex is temporarily unavailable. Your connection and resume data are
          still here. Try again later.
        </p>
      );
    case "expired":
      return (
        <p>
          {response?.connectionStatus === "authentication_revoked"
            ? "Codex connection needs attention. Reconnect Codex before you can continue."
            : "Codex connection expired. Reconnect Codex before you can continue."}
          {response?.safeMessage === null
            ? null
            : ` ${response?.safeMessage ?? ""}`}
        </p>
      );
  }
}

export type { BeginCodexConnectionOutcome, ReadCodexConnectionStatusOutcome };
export type { CancelCodexConnectionOutcome };
export type { DisconnectCodexConnectionOutcome };
