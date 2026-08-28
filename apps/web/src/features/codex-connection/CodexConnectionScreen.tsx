"use client";

import { ConnectionStatusCard } from "./ConnectionStatusCard";
import {
  beginCodexConnection,
  cancelCodexConnection,
  disconnectCodexConnection,
  readCodexConnectionStatus,
} from "./client";

export function CodexConnectionScreen(props: {
  readonly onInitiateConnection?: typeof beginCodexConnection;
  readonly onReadStatus?: typeof readCodexConnectionStatus;
  readonly onCancelConnection?: typeof cancelCodexConnection;
  readonly onDisconnect?: typeof disconnectCodexConnection;
  readonly onNavigate?: (authorizationUrl: string) => void;
}) {
  return <ConnectionStatusCard {...props} />;
}
