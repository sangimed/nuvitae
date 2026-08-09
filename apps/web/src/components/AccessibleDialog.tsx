"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  Ref,
  RefObject,
} from "react";

/**
 * T060 - shared accessible dialog primitive.
 *
 * Reusable modal/non-modal dialog used by confirmation, retry, cancellation,
 * discard, and deletion flows. It owns dialog semantics (role, accessible
 * name/description, modality, focus trap, Escape and backdrop behavior,
 * deterministic initial focus, and focus restoration) without embedding any
 * import-specific copy or business logic.
 */

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

export type AccessibleDialogFocusTarget =
  | RefObject<HTMLElement | null>
  | ((container: HTMLElement) => HTMLElement | null | undefined);

export interface AccessibleDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /**
   * Accessible name. Provide either `label` (aria-label) or `labelledBy`
   * (id of a visible heading). One of the two is required.
   */
  readonly label?: string;
  readonly labelledBy?: string;
  /** Optional id of an element that describes the dialog. */
  readonly describedBy?: string;
  /** Whether Escape closes the dialog. Defaults to true. */
  readonly closeOnEscape?: boolean;
  /**
   * Whether clicking the backdrop closes the dialog. Explicit opt-in;
   * defaults to false so destructive dialogs cannot be dismissed by
   * accident.
   */
  readonly closeOnBackdropClick?: boolean;
  /** Whether the dialog is modal. Defaults to true. */
  readonly modal?: boolean;
  /**
   * Deterministic initial focus. Defaults to the first focusable
   * descendant, then the dialog container itself.
   */
  readonly initialFocus?: AccessibleDialogFocusTarget;
  /**
   * Element that receives focus when the dialog closes. Defaults to the
   * element that had focus when the dialog opened.
   */
  readonly restoreFocus?: AccessibleDialogFocusTarget;
  /**
   * Marks the dialog as destructive with a visible text warning so the
   * distinction never relies on color alone.
   */
  readonly destructive?: boolean;
  readonly children: ReactNode;
}

function getFocusableElements(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

function resolveFocusTarget(
  target: AccessibleDialogFocusTarget | undefined,
  container: HTMLElement,
): HTMLElement | null {
  if (target === undefined) return null;
  if (typeof target === "function") {
    return target(container) ?? null;
  }
  return target.current;
}

function setRefs(
  refs: readonly Ref<HTMLDivElement>[],
  value: HTMLDivElement | null,
) {
  for (const ref of refs) {
    if (ref === null) continue;
    if (typeof ref === "function") {
      ref(value);
    } else {
      ref.current = value;
    }
  }
}

export const AccessibleDialog = forwardRef<
  HTMLDivElement,
  AccessibleDialogProps
>(function AccessibleDialog(props, externalRef) {
  const {
    open,
    onClose,
    label,
    labelledBy,
    describedBy,
    closeOnEscape = true,
    closeOnBackdropClick = false,
    modal = true,
    initialFocus,
    restoreFocus,
    destructive = false,
    children,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusTargetRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  if (
    process.env.NODE_ENV !== "production" &&
    label === undefined &&
    labelledBy === undefined
  ) {
    // Accessible name is a hard requirement; fail loudly in development.
    console.error(
      "[AccessibleDialog] Provide an accessible name through `label` or `labelledBy`.",
    );
  }

  const resolveInitialFocus = useCallback(
    (container: HTMLElement): HTMLElement => {
      const configured = resolveFocusTarget(initialFocus, container);
      if (configured !== null) return configured;
      const firstFocusable = getFocusableElements(container)[0];
      return firstFocusable ?? container;
    },
    [initialFocus],
  );

  const resolveRestoreFocus = useCallback(
    (container: HTMLElement): HTMLElement | null => {
      const configured = resolveFocusTarget(restoreFocus, container);
      if (configured !== null) return configured;
      return previousFocusRef.current;
    },
    [restoreFocus],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (container === null) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    restoreFocusTargetRef.current = resolveRestoreFocus(container);
    resolveInitialFocus(container).focus();
  }, [open, resolveInitialFocus, resolveRestoreFocus]);

  useLayoutEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const restoreTarget = restoreFocusTargetRef.current;
    if (
      restoreTarget !== null &&
      restoreTarget.isConnected &&
      typeof restoreTarget.focus === "function"
    ) {
      restoreTarget.focus();
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !modal) return;
    const container = containerRef.current;
    if (container === null) return;

    const keepFocusInside = (event: FocusEvent) => {
      const next = event.target;
      if (next instanceof HTMLElement && container.contains(next)) return;
      const focusable = getFocusableElements(container);
      (focusable[0] ?? container).focus();
    };

    document.addEventListener("focusin", keepFocusInside);
    return () => document.removeEventListener("focusin", keepFocusInside);
  }, [open, modal]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (!closeOnEscape) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!modal || event.key !== "Tab") return;

    const container = containerRef.current;
    if (container === null) return;
    event.preventDefault();
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      container.focus();
      return;
    }
    const first = focusable[0] ?? container;
    const last = focusable[focusable.length - 1] ?? first;
    const active = document.activeElement;
    const currentIndex =
      active instanceof HTMLElement && container.contains(active)
        ? focusable.indexOf(active)
        : -1;

    if (event.shiftKey) {
      const next =
        currentIndex > 0 ? (focusable[currentIndex - 1] ?? last) : last;
      next.focus();
      return;
    }
    const next =
      currentIndex >= 0 && currentIndex < focusable.length - 1
        ? (focusable[currentIndex + 1] ?? first)
        : first;
    next.focus();
  }

  function handleBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!closeOnBackdropClick) return;
    if (event.target !== event.currentTarget) return;
    onClose();
  }

  if (!open) return null;

  const nameProps =
    label !== undefined
      ? { "aria-label": label }
      : labelledBy !== undefined
        ? { "aria-labelledby": labelledBy }
        : {};

  return (
    <div
      className="dialog-backdrop accessible-dialog-backdrop"
      data-dialog-backdrop=""
      onClick={handleBackdropClick}
    >
      <div
        ref={(node) => setRefs([containerRef, externalRef], node)}
        role="dialog"
        {...(modal ? { "aria-modal": "true" } : {})}
        {...nameProps}
        {...(describedBy === undefined
          ? {}
          : { "aria-describedby": describedBy })}
        className="dialog accessible-dialog"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {destructive ? (
          <p className="dialog-warning-marker" data-destructive-marker="">
            <span aria-hidden="true">⚠</span> Destructive action
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
});
