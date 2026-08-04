/**
 * T062 - small reusable focus-management utilities.
 *
 * DOM access is localized to these helpers: components receive element
 * targets and these utilities perform focus, scroll, and reduced-motion
 * decisions. Every helper is a safe no-op when its target is missing or
 * disconnected.
 */

export type FocusElementTarget =
  HTMLElement | { readonly current: HTMLElement | null } | null | undefined;

export interface FocusTargetOptions {
  readonly preventScroll?: boolean;
  readonly respectReducedMotion?: boolean;
}

export function resolveFocusElement(
  target: FocusElementTarget,
): HTMLElement | null {
  if (target === null || target === undefined) return null;
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
    return target;
  }
  if ("current" in target) {
    return target.current;
  }
  return null;
}

export function prefersReducedMotion(
  win:
    | {
        readonly matchMedia?: (
          query: string,
        ) => { readonly matches: boolean } | null;
      }
    | undefined = undefined,
): boolean {
  const matchMedia =
    win?.matchMedia ??
    (globalThis as { matchMedia?: typeof window.matchMedia }).matchMedia;
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

/**
 * Focuses a target element. Returns false when the target is missing,
 * disconnected, or not focusable. Avoids re-focusing an already focused
 * element so repeated state updates never steal focus or trigger scrolling.
 */
export function focusTarget(
  target: FocusElementTarget,
  options: FocusTargetOptions = {},
): boolean {
  const element = resolveFocusElement(target);
  if (element === null) return false;
  if (element.isConnected === false) return false;
  if (typeof element.focus !== "function") return false;
  if (document.activeElement === element) return true;

  const respectReducedMotion = options.respectReducedMotion ?? true;
  const preventScroll =
    options.preventScroll ??
    (respectReducedMotion ? prefersReducedMotion() : false);
  element.focus({ preventScroll });
  return document.activeElement === element;
}

/**
 * Focuses the first invalid control (by DOM order) inside a container.
 * Recognizes `aria-invalid="true"` and `data-invalid="true"`.
 */
export function focusFirstInvalidControl(
  container: HTMLElement | Document | null | undefined,
): boolean {
  if (container === null || container === undefined) return false;
  const invalid = container.querySelector<HTMLElement>(
    '[aria-invalid="true"], [data-invalid="true"]',
  );
  return focusTarget(invalid);
}

/** Focuses an error summary element (or ref) after a failed submit. */
export function focusErrorSummary(summary: FocusElementTarget): boolean {
  return focusTarget(summary);
}

/** Focuses the element with the given id, used by error-summary links. */
export function focusElementById(id: string): boolean {
  if (typeof document === "undefined") return false;
  return focusTarget(document.getElementById(id));
}

/** Restores focus to a dialog trigger (or ref) after the dialog closes. */
export function restoreFocusAfterDialog(trigger: FocusElementTarget): boolean {
  return focusTarget(trigger);
}

/** Focuses a newly displayed recovery section (or ref) on appearance. */
export function focusRecoverySection(section: FocusElementTarget): boolean {
  return focusTarget(section);
}

const headingSelector = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  '[role="heading"]',
].join(",");

/**
 * Focuses the next logical heading after navigation or a state change:
 * the first heading in the container when no heading is focused, otherwise
 * the heading that follows the currently focused one.
 */
export function focusNextLogicalHeading(
  container: HTMLElement | Document | null | undefined,
): boolean {
  if (container === null || container === undefined) return false;
  const headings = Array.from(
    container.querySelectorAll<HTMLElement>(headingSelector),
  );
  if (headings.length === 0) return false;
  const currentIndex = headings.findIndex(
    (heading) => heading === document.activeElement,
  );
  const next = currentIndex >= 0 ? headings[currentIndex + 1] : headings[0];
  if (next === undefined) return false;
  if (focusTarget(next)) return true;
  // Headings are programmatically focusable targets: make the heading
  // focusable when it does not carry a tabindex yet, then focus it.
  if (!next.hasAttribute("tabindex")) {
    next.tabIndex = -1;
    return focusTarget(next);
  }
  return false;
}
