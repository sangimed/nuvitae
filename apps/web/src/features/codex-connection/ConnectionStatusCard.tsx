"use client";

import { useEffect, useRef, useState } from "react";
import type { ProviderConnectionStatusResponse } from "@nuvitae/contracts";
import {
  Alert,
  Button,
  ButtonLink,
  StatusState,
  type StatusTone,
} from "../../components/community";
import { recordCommunityFunnelEvent } from "../../services/community-funnel";
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

type DeviceHandoff = {
  readonly authorizationUrl: string;
  readonly userCode: string;
};

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
  readonly manualEntryHref?: string;
}) {
  const [status, setStatus] = useState<ProviderConnectionStatusResponse>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [statusMessageTone, setStatusMessageTone] = useState<
    "success" | "error"
  >("error");
  const [statusChecked, setStatusChecked] = useState(
    props.onReadStatus === undefined &&
      props.onInitiateConnection !== undefined,
  );
  const [deviceHandoff, setDeviceHandoff] = useState<DeviceHandoff>();
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const inFlight = useRef(false);
  const connectionAttempted = useRef(false);
  const readyRecorded = useRef(false);
  const statusFailureRecorded = useRef(false);
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
        setStatusMessageTone("error");
        setStatusMessage(outcome.message);
        if (!statusFailureRecorded.current) {
          statusFailureRecorded.current = true;
          recordCommunityFunnelEvent({
            funnelEvent: "provider_connection.failed",
            failureCategory: "status_failed",
          });
        }
      }
      setStatusChecked(true);
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
          setStatusMessageTone("error");
          setStatusMessage(outcome.message);
          recordCommunityFunnelEvent({
            funnelEvent: "provider_connection.failed",
            failureCategory: "status_failed",
          });
        }
      });
    }

    window.addEventListener("message", handleConnectionComplete);
    return () =>
      window.removeEventListener("message", handleConnectionComplete);
  }, [readStatus]);

  useEffect(() => {
    if (status?.connectionStatus !== "login_pending") return;
    const controller = new AbortController();
    const refresh = () => {
      void readStatus({ signal: controller.signal }).then((outcome) => {
        if (controller.signal.aborted || !outcome.ok) return;
        setStatus(outcome.response);
        if (outcome.response.connectionStatus !== "login_pending") {
          setDeviceHandoff(undefined);
          setBusy(false);
          inFlight.current = false;
        }
      });
    };
    const interval = window.setInterval(refresh, 2_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [readStatus, status?.connectionStatus]);

  const visibleStatus = statusChecked ? toVisibleStatus(status) : "loading";
  const canStart =
    visibleStatus === "disconnected" || visibleStatus === "expired";
  const connectAction =
    status === undefined || status.connectionStatus === "not_configured"
      ? "Connect Codex"
      : "Reconnect Codex";

  useEffect(() => {
    if (visibleStatus !== "ready" || readyRecorded.current) return;
    readyRecorded.current = true;
    recordCommunityFunnelEvent({
      funnelEvent: "provider_connection.ready",
    });
  }, [visibleStatus]);

  async function connect() {
    if (inFlight.current || !canStart) return;
    inFlight.current = true;
    connectionAttempted.current = true;
    setBusy(true);
    setStatusMessage(undefined);
    recordCommunityFunnelEvent({
      funnelEvent: "provider_connection.initiated",
    });
    const popup =
      props.onNavigate === undefined
        ? window.open(
            "about:blank",
            "nuvitae-codex-connection",
            "popup,width=520,height=720",
          )
        : null;
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
      setStatusChecked(true);
      setDeviceHandoff({
        authorizationUrl: outcome.response.authorizationUrl,
        userCode: outcome.response.userCode,
      });
      setBusy(false);
      inFlight.current = false;
      if (navigator.clipboard !== undefined) {
        void navigator.clipboard
          .writeText(outcome.response.userCode)
          .catch(() => undefined);
      }
      if (props.onNavigate === undefined) {
        if (popup === null) {
          setStatusMessageTone("error");
          setStatusMessage(
            "Open the secure OpenAI page below to finish connecting.",
          );
        } else {
          popup.location.replace(outcome.response.authorizationUrl);
          popup.focus();
        }
      } else {
        props.onNavigate(outcome.response.authorizationUrl);
      }
      return;
    }
    popup?.close();
    inFlight.current = false;
    setBusy(false);
    setStatusMessageTone("error");
    setStatusMessage(outcome.message);
    recordCommunityFunnelEvent({
      funnelEvent: "provider_connection.failed",
      failureCategory: "initiation_failed",
    });
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
      setStatusMessageTone("success");
      setStatusMessage("Codex disconnected. Your resume data is still here.");
    } else {
      setStatusMessageTone("error");
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
      setStatusMessageTone("success");
      setStatusMessage("Codex connection cancelled. You can try again.");
    } else {
      setStatusMessageTone("error");
      setStatusMessage(outcome.message);
    }
    inFlight.current = false;
    setBusy(false);
  }

  return (
    <section
      className="guidance-panel codex-connection-card"
      aria-labelledby="codex-connection-title"
    >
      <h2 id="codex-connection-title">Codex for resume import</h2>
      {statusMessage === undefined ? null : (
        <Alert tone={statusMessageTone}>{statusMessage}</Alert>
      )}
      <StatusState
        tone={toneForStatus(visibleStatus)}
        title={titleForStatus(visibleStatus, status)}
        action={
          visibleStatus === "loading" ? undefined : (
            <div className="action-row">
              {canStart ? (
                <Button
                  onClick={() => void connect()}
                  loading={busy}
                  disabled={busy}
                >
                  {busy ? "Opening secure connection…" : connectAction}
                </Button>
              ) : null}
              {visibleStatus === "connecting" ? (
                <Button
                  variant="secondary"
                  onClick={() => void cancelConnection()}
                  loading={busy}
                  disabled={busy}
                >
                  {busy ? "Cancelling…" : "Cancel connection"}
                </Button>
              ) : null}
              {visibleStatus === "ready" ? (
                <Button
                  variant="secondary"
                  onClick={() => setDisconnectOpen(true)}
                  disabled={busy}
                >
                  Disconnect
                </Button>
              ) : null}
              {props.manualEntryHref === undefined ||
              visibleStatus === "ready" ||
              visibleStatus === "connecting" ? null : (
                <ButtonLink href={props.manualEntryHref} variant="quiet">
                  Enter my details manually instead
                </ButtonLink>
              )}
            </div>
          )
        }
      >
        {bodyForStatus(visibleStatus, status)}
        {visibleStatus === "connecting" && deviceHandoff !== undefined ? (
          <div className="codex-device-handoff">
            <p>
              Enter this one-time code on the secure OpenAI page. It has also
              been copied when your browser permits it.
            </p>
            <p>
              <strong
                aria-label={`Codex one-time code ${deviceHandoff.userCode}`}
              >
                {deviceHandoff.userCode}
              </strong>
            </p>
            <ButtonLink
              href={deviceHandoff.authorizationUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
            >
              Open secure OpenAI page
            </ButtonLink>
          </div>
        ) : null}
      </StatusState>
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

function toneForStatus(status: VisibleStatus): StatusTone {
  switch (status) {
    case "loading":
    case "connecting":
      return "loading";
    case "disconnected":
      return "empty";
    case "ready":
      return "success";
    case "unavailable":
    case "expired":
      return "error";
  }
}

function titleForStatus(
  status: VisibleStatus,
  response: ProviderConnectionStatusResponse | undefined,
): string {
  switch (status) {
    case "loading":
      return "Checking your Codex connection";
    case "disconnected":
      return "Connect Codex to import your resume";
    case "connecting":
      return "Finish connecting Codex";
    case "ready":
      return "Codex is ready.";
    case "unavailable":
      return "Codex is temporarily unavailable";
    case "expired":
      return response?.connectionStatus === "authentication_revoked"
        ? "Reconnect Codex to continue"
        : "Your Codex connection has expired";
  }
}

function bodyForStatus(
  status: VisibleStatus,
  response: ProviderConnectionStatusResponse | undefined,
): string {
  switch (status) {
    case "loading":
      return "This will only take a moment.";
    case "disconnected":
      return "Codex helps Nuvitae organize the information in your file. You will review every detail before it is saved.";
    case "connecting":
      return "Keep this page open while you finish on the secure OpenAI page.";
    case "ready":
      return "You can now choose a resume file below.";
    case "unavailable":
      return "Your connection and resume data are still here. Try again later or enter your details manually.";
    case "expired":
      return `Reconnect before importing a resume.${
        response?.safeMessage === null ? "" : ` ${response?.safeMessage ?? ""}`
      }`;
  }
}

export type { BeginCodexConnectionOutcome, ReadCodexConnectionStatusOutcome };
export type { CancelCodexConnectionOutcome };
export type { DisconnectCodexConnectionOutcome };
