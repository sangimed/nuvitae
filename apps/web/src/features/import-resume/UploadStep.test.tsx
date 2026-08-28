// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadStep } from "./UploadStep";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;
const onBack = vi.fn();
const onFileSelected = vi.fn();
const onSubmit = vi.fn();

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

function renderUpload(props: { readonly busy?: boolean } = {}) {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() =>
    root.render(
      <UploadStep
        busy={props.busy ?? false}
        serverError={undefined}
        onBack={onBack}
        onFileSelected={onFileSelected}
        onSubmit={onSubmit}
      />,
    ),
  );
}

function fileInput(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function summary(): HTMLElement | null {
  return container.querySelector<HTMLElement>("[data-error-summary]");
}

function submitForm() {
  act(() => {
    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Upload and start import"))
      ?.click();
  });
}

function selectFile(name: string, type: string) {
  const input = fileInput();
  const file = new File(["synthetic content"], name, { type });
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("UploadStep error summary (T063)", () => {
  it("focuses the error summary after submitting without a file", () => {
    renderUpload();
    submitForm();
    expect(summary()).not.toBeNull();
    expect(summary()?.textContent).toContain(
      "Choose a resume file before starting the import.",
    );
    expect(document.activeElement).toBe(summary());
    expect(fileInput().getAttribute("aria-invalid")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("links the error summary to the file input and focuses it", () => {
    renderUpload();
    submitForm();
    const link = summary()?.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Resume file");
    act(() => link?.click());
    expect(document.activeElement).toBe(fileInput());
  });

  it("focuses the error summary for unsupported file selections", () => {
    renderUpload();
    selectFile("notes.txt", "text/plain");
    expect(summary()?.textContent).toContain(
      "Choose a PDF or DOCX resume file.",
    );
    expect(document.activeElement).toBe(summary());
  });

  it("clears the error and invalid state when a supported file is selected", () => {
    renderUpload();
    submitForm();
    expect(summary()).not.toBeNull();
    selectFile("resume.pdf", "application/pdf");
    expect(summary()).toBeNull();
    expect(fileInput().hasAttribute("aria-invalid")).toBe(false);
    expect(onFileSelected).toHaveBeenCalledWith(expect.any(File));
  });

  it("accepts a supported file dropped onto the upload area", () => {
    renderUpload();
    const dropzone =
      container.querySelector<HTMLLabelElement>(".upload-dropzone")!;
    const file = new File(["synthetic content"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { files: [file] },
    });

    act(() => dropzone.dispatchEvent(event));

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("keeps the upload control keyboard operable", () => {
    renderUpload();
    const submit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Upload and start import"),
    )!;
    act(() => submit.focus());
    expect(document.activeElement).toBe(submit);
  });
});
