// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteSourceControl } from "./DeleteSourceControl";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  deleteConfirmedResumeSource: vi.fn(),
}));

vi.mock("./client", () => ({
  deleteConfirmedResumeSource: mocks.deleteConfirmedResumeSource,
}));

const resumeId = "44444444-4444-4444-8444-444444444444";
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  mocks.deleteConfirmedResumeSource.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = undefined;
});

describe("DeleteSourceControl", () => {
  it("clearly distinguishes source deletion from resume deletion", () => {
    render();
    expect(container.textContent).toContain(
      "Deleting it keeps this resume and all edits.",
    );
    act(() => button("Delete uploaded source file").click());
    expect(container.textContent).toContain(
      "It does not delete your structured resume or your edits.",
    );
    expect(button("Delete source only")).toBe(document.activeElement);
  });

  it("requires explicit confirmation and reports completed deletion", async () => {
    const onDeleted = vi.fn(async () => undefined);
    mocks.deleteConfirmedResumeSource.mockResolvedValue({
      ok: true,
      response: {
        userMessage:
          "The uploaded source was deleted. Your structured resume and edits were kept.",
      },
    });
    render(onDeleted);
    act(() => button("Delete uploaded source file").click());
    await act(async () => button("Delete source only").click());

    expect(mocks.deleteConfirmedResumeSource).toHaveBeenCalledWith({
      resumeId,
    });
    expect(onDeleted).toHaveBeenCalledWith(
      "The uploaded source was deleted. Your structured resume and edits were kept.",
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the confirmation open on a privacy-safe failure", async () => {
    mocks.deleteConfirmedResumeSource.mockResolvedValue({
      ok: false,
      category: "temporarily_unavailable",
      message: "The uploaded source could not be deleted. Try again later.",
    });
    render();
    act(() => button("Delete uploaded source file").click());
    await act(async () => button("Delete source only").click());

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The uploaded source could not be deleted. Try again later.",
    );
  });
});

function render(onDeleted = vi.fn(async () => undefined)) {
  root = createRoot(container);
  act(() =>
    root?.render(
      <DeleteSourceControl
        resumeId={resumeId}
        disabled={false}
        onDeleted={onDeleted}
      />,
    ),
  );
}

function button(label: string): HTMLButtonElement {
  const candidate = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.includes(label),
  );
  expect(candidate).toBeDefined();
  return candidate as HTMLButtonElement;
}
