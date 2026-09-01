"use client";

import { useEffect, useState } from "react";

export interface RotatingLoadingMessageProps {
  readonly messages: readonly string[];
  readonly intervalMs?: number;
  readonly longWaitAfterMs?: number;
  readonly longWaitMessage?: string;
  readonly className?: string;
}

/**
 * Rotates secondary loading copy independently from real operation progress.
 * The element is deliberately not a live region, so the changing copy does
 * not compete with authoritative status announcements.
 */
export function RotatingLoadingMessage({
  messages,
  intervalMs = 7_000,
  longWaitAfterMs = 45_000,
  longWaitMessage,
  className,
}: RotatingLoadingMessageProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [waitingLonger, setWaitingLonger] = useState(false);

  useEffect(() => {
    setMessageIndex(0);
    setWaitingLonger(false);

    const rotation =
      messages.length > 1
        ? window.setInterval(() => {
            setMessageIndex((current) => (current + 1) % messages.length);
          }, intervalMs)
        : undefined;
    const longWait =
      longWaitMessage === undefined
        ? undefined
        : window.setTimeout(() => setWaitingLonger(true), longWaitAfterMs);

    return () => {
      if (rotation !== undefined) window.clearInterval(rotation);
      if (longWait !== undefined) window.clearTimeout(longWait);
    };
  }, [intervalMs, longWaitAfterMs, longWaitMessage, messages]);

  const message = waitingLonger
    ? longWaitMessage
    : messages[messageIndex % messages.length];

  if (message === undefined) return null;

  return (
    <p className={className} aria-live="off" data-loading-message>
      {message}
    </p>
  );
}
