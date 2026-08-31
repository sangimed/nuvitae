"use client";

import { useState, type KeyboardEvent } from "react";
import {
  resumeEditorSectionIds,
  type StructuredResumeContentContract,
} from "@nuvitae/contracts";
import {
  createResumeRenderingModel,
  ProfessionalResume,
} from "../resume-renderer";
import {
  StructuredResumeSections,
  type ResumeEditorSectionId,
} from "./StructuredResumeSections";
import type { ContextualAiEditingControls } from "./ContextualAiEditControl";

const sectionLabels: Record<ResumeEditorSectionId, string> = {
  basics: "Basics",
  summary: "Summary",
  workExperiences: "Work experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  certifications: "Certifications",
  languages: "Languages",
  professionalLinks: "Professional links",
};

export interface ResponsiveVisualResumeEditorProps {
  readonly value: StructuredResumeContentContract;
  readonly onChange: (value: StructuredResumeContentContract) => void;
  readonly disabled?: boolean;
  readonly validationErrors?: Readonly<Record<string, string>> | undefined;
  readonly aiEditing?: ContextualAiEditingControls | undefined;
}

export function ResponsiveVisualResumeEditor(
  props: ResponsiveVisualResumeEditorProps,
) {
  const [activeSection, setActiveSection] =
    useState<ResumeEditorSectionId>("basics");
  const [mobileMode, setMobileMode] = useState<"edit" | "preview">("edit");
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const sectionOrder = props.value.sectionOrder ?? resumeEditorSectionIds;

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sectionOrder.length) return;
    const next = [...sectionOrder];
    const [section] = next.splice(index, 1);
    if (section === undefined) return;
    next.splice(target, 0, section);
    props.onChange({ ...props.value, sectionOrder: next });
    setReorderAnnouncement(
      `${sectionLabels[section]} moved to position ${target + 1}.`,
    );
  }

  function switchModeFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextMode = event.key === "ArrowLeft" ? "edit" : "preview";
    setMobileMode(nextMode);
    requestAnimationFrame(() => {
      document.getElementById(`${nextMode}-mode-tab`)?.focus();
    });
  }

  return (
    <div className="visual-editor" data-mobile-mode={mobileMode}>
      <div className="editor-mode-tabs" role="tablist" aria-label="Editor view">
        <button
          id="edit-mode-tab"
          type="button"
          role="tab"
          aria-selected={mobileMode === "edit"}
          aria-controls="resume-edit-pane"
          tabIndex={mobileMode === "edit" ? 0 : -1}
          onClick={() => setMobileMode("edit")}
          onKeyDown={switchModeFromKeyboard}
        >
          Edit
        </button>
        <button
          id="preview-mode-tab"
          type="button"
          role="tab"
          aria-selected={mobileMode === "preview"}
          aria-controls="resume-preview-pane"
          tabIndex={mobileMode === "preview" ? 0 : -1}
          onClick={() => setMobileMode("preview")}
          onKeyDown={switchModeFromKeyboard}
        >
          Preview
        </button>
      </div>

      <div className="visual-editor-layout">
        <div
          id="resume-edit-pane"
          className="resume-edit-pane"
          role="tabpanel"
          aria-labelledby="edit-mode-tab"
        >
          <nav className="section-navigation" aria-label="Resume sections">
            <h2>Sections</h2>
            <ol>
              {sectionOrder.map((section, index) => (
                <li key={section}>
                  <button
                    className="section-navigation-button"
                    type="button"
                    aria-current={
                      activeSection === section ? "step" : undefined
                    }
                    onClick={() => setActiveSection(section)}
                  >
                    {sectionLabels[section]}
                  </button>
                  <span className="section-reorder-actions">
                    <button
                      type="button"
                      aria-label={`Move ${sectionLabels[section]} up`}
                      disabled={props.disabled === true || index === 0}
                      onClick={() => moveSection(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${sectionLabels[section]} down`}
                      disabled={
                        props.disabled === true ||
                        index === sectionOrder.length - 1
                      }
                      onClick={() => moveSection(index, 1)}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <p className="import-status-live-region" aria-live="polite">
              {reorderAnnouncement}
            </p>
          </nav>

          <div className="focused-section-editor">
            <StructuredResumeSections
              value={props.value}
              mode="manual"
              activeSection={activeSection}
              {...(props.disabled === undefined
                ? {}
                : { disabled: props.disabled })}
              {...(props.validationErrors === undefined
                ? {}
                : { validationErrors: props.validationErrors })}
              {...(props.aiEditing === undefined
                ? {}
                : { aiEditing: props.aiEditing })}
              onChange={props.onChange}
            />
          </div>
        </div>

        <aside
          id="resume-preview-pane"
          className="resume-preview-pane"
          role="tabpanel"
          aria-labelledby="preview-mode-tab"
          aria-label="Resume preview"
          data-preview-surface="professional-resume"
        >
          <div className="preview-heading">
            <div>
              <p className="eyebrow">Live preview</p>
              <h2>Resume preview</h2>
            </div>
            <p>Updates as you edit.</p>
          </div>
          <div className="preview-document">
            <ProfessionalResume
              model={createResumeRenderingModel(props.value)}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
