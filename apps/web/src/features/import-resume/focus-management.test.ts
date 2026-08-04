// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  focusElementById,
  focusErrorSummary,
  focusFirstInvalidControl,
  focusNextLogicalHeading,
  focusRecoverySection,
  focusTarget,
  prefersReducedMotion,
  restoreFocusAfterDialog,
} from "./focus-management";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

describe("focus-management (T062)", () => {
  it("focuses the first invalid control in DOM order", () => {
    container.innerHTML = `
      <input id="first" data-invalid="true" />
      <input id="second" aria-invalid="true" />
    `;
    expect(focusFirstInvalidControl(container)).toBe(true);
    expect(document.activeElement).toBe(document.getElementById("first"));
  });

  it("does not re-focus an already focused invalid control", () => {
    container.innerHTML = `<input id="first" aria-invalid="true" />`;
    const input = document.getElementById("first") as HTMLInputElement;
    const focusSpy = vi.spyOn(input, "focus");
    input.focus();
    focusSpy.mockClear();
    expect(focusFirstInvalidControl(container)).toBe(true);
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("fails safely when targets or containers are missing", () => {
    expect(focusTarget(null)).toBe(false);
    expect(focusTarget(undefined)).toBe(false);
    expect(focusFirstInvalidControl(null)).toBe(false);
    expect(focusFirstInvalidControl(undefined)).toBe(false);
    expect(focusFirstInvalidControl(container)).toBe(false);
    expect(focusErrorSummary(undefined)).toBe(false);
    expect(focusElementById("missing-id")).toBe(false);
    expect(focusNextLogicalHeading(null)).toBe(false);
    expect(focusNextLogicalHeading(container)).toBe(false);
  });

  it("fails safely for detached targets", () => {
    const detached = document.createElement("button");
    expect(focusTarget(detached)).toBe(false);
    expect(restoreFocusAfterDialog(detached)).toBe(false);
  });

  it("restores focus to a dialog trigger after close", () => {
    container.innerHTML = `<button id="trigger">Open</button>`;
    const trigger = document.getElementById("trigger") as HTMLButtonElement;
    expect(restoreFocusAfterDialog(trigger)).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(restoreFocusAfterDialog({ current: trigger })).toBe(true);
  });

  it("focuses a newly displayed recovery section intentionally", () => {
    container.innerHTML = `<section id="recovery" tabindex="-1"></section>`;
    const section = document.getElementById("recovery") as HTMLElement;
    expect(focusRecoverySection(section)).toBe(true);
    expect(document.activeElement).toBe(section);
  });

  it("focuses the next logical heading after navigation or state changes", () => {
    container.innerHTML = `
      <h1 id="first-heading">Import</h1>
      <section>
        <h2 id="second-heading">Review</h2>
      </section>
    `;
    expect(focusNextLogicalHeading(container)).toBe(true);
    expect(document.activeElement).toBe(
      document.getElementById("first-heading"),
    );

    (document.getElementById("first-heading") as HTMLElement).focus();
    expect(focusNextLogicalHeading(container)).toBe(true);
    expect(document.activeElement).toBe(
      document.getElementById("second-heading"),
    );
  });

  it("respects reduced-motion preferences when scrolling", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);
    container.innerHTML = `<input id="target" />`;
    const target = document.getElementById("target") as HTMLInputElement;
    const focusSpy = vi.spyOn(target, "focus");
    expect(prefersReducedMotion()).toBe(true);
    expect(focusTarget(target)).toBe(true);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("allows callers to opt out of reduced-motion scroll behavior", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    container.innerHTML = `<input id="target" />`;
    const target = document.getElementById("target") as HTMLInputElement;
    const focusSpy = vi.spyOn(target, "focus");
    expect(focusTarget(target, { respectReducedMotion: false })).toBe(true);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: false });
  });

  it("focuses by id and reports failure for unknown ids", () => {
    container.innerHTML = `<button id="known">Known</button>`;
    expect(focusElementById("known")).toBe(true);
    expect(document.activeElement).toBe(document.getElementById("known"));
    expect(focusElementById("unknown")).toBe(false);
  });
});
