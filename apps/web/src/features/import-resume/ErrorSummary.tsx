"use client";

import { forwardRef, useId, useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { focusElementById } from "./focus-management";

/**
 * T062 - accessible error summary.
 *
 * Lists validation and processing errors in a stable, deduplicated order,
 * links field-level errors to their controls, and supports generic and
 * provider-neutral recovery errors. It never renders internal codes or raw
 * diagnostics, renders nothing when there are no errors, and remains
 * understandable without color.
 */

export interface ErrorSummaryItem {
  /** Stable key used for deduplication. */
  readonly id: string;
  readonly message: string;
  /** Id of the related control or section; makes the error a link. */
  readonly targetId?: string;
  /** Optional human-readable field label shown before the message. */
  readonly fieldLabel?: string;
}

export interface ErrorSummaryProps {
  readonly errors: readonly ErrorSummaryItem[];
  readonly heading?: string;
  readonly id?: string;
  /** Language of error prose when it differs from the localized heading. */
  readonly messagesLang?: string;
  readonly messagesDir?: "ltr" | "rtl" | "auto";
  /** Optional handler invoked when a field-level error link is activated. */
  readonly onNavigateToTarget?: (targetId: string) => void;
}

const publicErrorTextPattern = /^[\p{L}\p{N}\s.,!?'’"()\-—%]+$/u;
const maximumPublicErrorLength = 240;

/**
 * Accepts only plain public prose so internal codes, paths, URLs, key-value
 * syntax, and other diagnostics never reach users or assistive technology.
 */
export function toPublicErrorText(message: string): string | undefined {
  const trimmed = message.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > maximumPublicErrorLength ||
    !publicErrorTextPattern.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

/**
 * Deduplicates errors by stable id (or message and target when the id is
 * empty) and preserves first-seen order, so repeated or identical errors are
 * announced exactly once in a deterministic order.
 */
export function normalizeErrorSummaryItems(
  errors: readonly ErrorSummaryItem[],
): readonly ErrorSummaryItem[] {
  const seen = new Set<string>();
  const result: ErrorSummaryItem[] = [];
  for (const item of errors) {
    const message = toPublicErrorText(item.message);
    if (message === undefined) continue;
    const key =
      item.id.length > 0 ? item.id : `${item.targetId ?? ""}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: item.id,
      message,
      ...(item.targetId === undefined ? {} : { targetId: item.targetId }),
      ...(item.fieldLabel === undefined ? {} : { fieldLabel: item.fieldLabel }),
    });
  }
  return result;
}

export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(
  function ErrorSummary(props, ref) {
    const {
      errors,
      heading = "There is a problem",
      id,
      onNavigateToTarget,
    } = props;
    const items = useMemo(() => normalizeErrorSummaryItems(errors), [errors]);
    const titleId = useId();

    if (items.length === 0) return null;

    function handleLink(
      event: ReactMouseEvent<HTMLAnchorElement>,
      targetId: string,
    ) {
      if (onNavigateToTarget !== undefined) {
        onNavigateToTarget(targetId);
        return;
      }
      focusElementById(targetId);
    }

    return (
      <div
        ref={ref}
        {...(id === undefined ? {} : { id })}
        className="error-summary"
        role="alert"
        tabIndex={-1}
        aria-labelledby={titleId}
        data-error-summary=""
      >
        <h2 id={titleId}>{heading}</h2>
        <ul lang={props.messagesLang} dir={props.messagesDir}>
          {items.map((item) => {
            const targetId = item.targetId;
            if (targetId === undefined) {
              return (
                <li key={item.id}>
                  <span>{item.message}</span>
                </li>
              );
            }
            return (
              <li key={item.id}>
                <a
                  href={`#${targetId}`}
                  onClick={(event) => handleLink(event, targetId)}
                >
                  {item.fieldLabel === undefined
                    ? item.message
                    : `${item.fieldLabel}: ${item.message}`}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
);
