"use client";

import { ConnectionStatusCard } from "./ConnectionStatusCard";
import {
  beginCodexConnection,
  readCodexConnectionStatus,
} from "../../services/import-resume/codex-connection-client";

export function CodexConnectionScreen(props: {
  readonly onInitiateConnection?: typeof beginCodexConnection;
  readonly onReadStatus?: typeof readCodexConnectionStatus;
  readonly onNavigate?: (authorizationUrl: string) => void;
}) {
  return <ConnectionStatusCard {...props} />;
}
