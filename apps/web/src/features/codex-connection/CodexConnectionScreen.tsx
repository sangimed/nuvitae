"use client";

import { ConnectionStatusCard } from "./ConnectionStatusCard";
import {
  beginCodexConnection,
  disconnectCodexConnection,
  readCodexConnectionStatus,
} from "./client";

export function CodexConnectionScreen(props: {
  readonly onInitiateConnection?: typeof beginCodexConnection;
  readonly onReadStatus?: typeof readCodexConnectionStatus;
  readonly onDisconnect?: typeof disconnectCodexConnection;
  readonly onNavigate?: (authorizationUrl: string) => void;
}) {
  return <ConnectionStatusCard {...props} />;
}
