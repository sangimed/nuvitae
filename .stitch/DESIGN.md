---
version: alpha
name: Nuvitae
description: >
  Canonical visual design system for the Nuvitae product interface.
  Resume templates are visually independent from the product UI.

colors:
  primary: "#1B3022"
  primary-strong: "#102118"
  primary-subtle: "#E7ECE7"
  on-primary: "#FFFFFF"

  canvas: "#F7F5EF"
  surface: "#FDFCF8"
  surface-subtle: "#F1EFE8"

  text: "#1C211D"
  text-muted: "#62675F"
  border: "#DEDCD4"

  focus: "#A54B00"

  success: "#146C3A"
  warning: "#805C0B"
  error: "#A12A20"

  resume-page: "#FFFFFF"
  resume-text: "#202020"

typography:
  display:
    fontFamily: "Source Serif 4"
    fontSize: 3rem
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.02em"

  heading-lg:
    fontFamily: "Source Serif 4"
    fontSize: 2rem
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.015em"

  heading-md:
    fontFamily: "Source Serif 4"
    fontSize: 1.5rem
    fontWeight: 500
    lineHeight: 1.2

  body:
    fontFamily: "Inter"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5

  body-sm:
    fontFamily: "Inter"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.45

  label:
    fontFamily: "Inter"
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1.3

  metadata:
    fontFamily: "Inter"
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.3

spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px

rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 8px
  sheet: 16px

components:
  app-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"

  surface-subtle:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text}"

  navigation-active:
    backgroundColor: "{colors.primary-subtle}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"

  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px

  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px

  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px

  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px

  metadata-text:
    textColor: "{colors.text-muted}"
    typography: "{typography.metadata}"

  divider:
    backgroundColor: "{colors.border}"
    height: 1px

  focus-indicator:
    backgroundColor: "{colors.focus}"
    size: 2px
    rounded: "{rounded.sm}"

  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"

  status-warning:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warning}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"

  status-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"

  resume-preview:
    backgroundColor: "{colors.resume-page}"
    textColor: "{colors.resume-text}"
    rounded: "{rounded.none}"
---

## Overview

Nuvitae is a calm, document-first resume workspace.

The product interface should feel precise, trustworthy and editorial without
becoming ornamental or resembling a newspaper.

The resume is the main object. Product chrome should support the document
rather than compete with it.

The approved visual language uses:

- warm paper-like application surfaces;
- deep forest green as the primary product accent;
- serif typography for major editorial headings;
- clean sans-serif typography for controls and dense information;
- generous whitespace;
- hairline separators;
- little or no decorative elevation;
- square or very low-radius controls;
- restrained use of color.

The visual direction may be referred to internally as "Editorial Studio", but
this name must never appear as a product name or feature name. The product is
Nuvitae.

The product UI and resume templates are separate visual systems.

## Colors

`primary` is the canonical Nuvitae product accent.

`primary-strong` is used for stronger interactive emphasis, primarily hover or
pressed states of primary controls.

`primary-subtle` is used for selected or active UI states where the full primary
color would be too visually dominant.

`canvas` is the main application background.

`surface` is used for primary working surfaces, forms and foreground content.

`surface-subtle` is used when a secondary layer must be distinguished without
introducing a heavy card.

`border` is the default hairline separator.

`focus` is the canonical visible-focus accent.

The DESIGN.md component schema cannot describe CSS borders or outlines directly.
The `focus-indicator` component therefore records the canonical focus color and
visual thickness. Production CSS should implement this using an accessible
outline or equivalent focus ring.

`text-muted` is reserved for supporting information and metadata. It must not
be used where reduced contrast would make important information difficult to
read.

Semantic success, warning and error colors must always be accompanied by text,
icons or another non-color signal.

`resume-page` and `resume-text` describe the neutral preview surface only.
They do not define the visual styling of individual resume templates.

Do not introduce screen-specific colors when an existing semantic token fits.

Do not use purple gradients, glowing AI colors or decorative gradients as part
of the Nuvitae visual identity.

## Typography

Typography is a major part of Nuvitae's identity.

Use `display`, `heading-lg` and `heading-md` for important editorial hierarchy.

Use `body`, `body-sm`, `label` and `metadata` for product controls, forms,
navigation, status text and supporting information.

Major headings use Source Serif 4.

Product controls and dense interface content use Inter.

Product copy should remain plain and direct even when the typography is
editorial.

Prefer:

- "My resumes"
- "Import resume"
- "Create from scratch"
- "Review imported resume"
- "Download PDF"

Avoid unnecessarily literary product language.

Resume templates do not automatically inherit the Nuvitae product fonts.

A resume template may define its own ATS-conscious typography independently
from the product UI.

## Layout

Use whitespace, alignment and typography before introducing a bordered
container.

Avoid treating every logical group as a card.

Desktop editing follows this conceptual layout:

    resume section navigation
    +
    focused section editor
    +
    live resume preview

The user edits one logical resume section at a time.

Do not convert the editor into one long form containing the entire resume.

The live resume should have greater visual weight than surrounding product
chrome.

Application navigation should become visually secondary while a resume is
open.

On mobile, editing and previewing are separate modes:

    Edit | Preview

Do not vertically stack the full desktop editor.

Mobile section navigation must support every resume section without assuming
that all section names fit on screen simultaneously.

Persistent mobile actions must respect safe areas and must not cover the final
editable or preview content.

## Elevation & Depth

Nuvitae uses very little elevation.

Prefer:

- background contrast;
- whitespace;
- hairline separators;
- typography;

over shadows.

A resume page may use subtle elevation against the application canvas because
it represents a physical document.

Dialogs and mobile sheets may use limited elevation when necessary to
communicate layering.

Avoid floating-card aesthetics.

Avoid using shadows merely to compensate for weak spacing or hierarchy.

## Shapes

Controls are square or use very small corner radii.

Do not use pill-shaped controls as the default treatment.

Larger radii are reserved for interaction patterns where the physical shape
helps communicate behavior, such as a mobile bottom sheet.

Do not apply rounded rectangles indiscriminately to every group of content.

The default visual language should remain restrained and editorial.

## Components

### Application shell

Keep global product navigation restrained.

When a resume is open, the document and its editing tools take priority over
global navigation.

Context-specific actions such as Design and Export belong to the opened resume,
not to permanent global navigation.

Importing and creating a resume are creation actions rather than permanent
workspace destinations.

### Buttons

Primary buttons use the primary product accent and should represent the clearest
next action.

Avoid multiple equally prominent primary actions in the same visual region.

Secondary and destructive actions must remain discoverable and must never rely
on hover-only visibility.

Interactive states should remain visually restrained:

- default;
- hover;
- focus;
- pressed;
- disabled;
- loading.

The primary hover treatment uses `primary-strong`.

Keyboard focus uses the `focus` color and must remain clearly visible against
both canvas and surface backgrounds.

### Forms

Inputs should feel lightweight but remain clearly identifiable as interactive
controls.

Labels remain visible.

Placeholders do not replace labels.

Validation appears close to the affected field and is announced accessibly.

Do not rely on border color alone to communicate validation errors.

Long forms should preserve clear section hierarchy and comfortable vertical
rhythm.

### Resume library

Resume entries should read as documents rather than dashboard records.

A document thumbnail may be used when it improves recognition.

Metadata such as the last edited date should remain visually secondary.

Do not introduce:

- analytics;
- KPIs;
- artificial statuses;
- collaboration indicators;
- cloud synchronization indicators;

into the document library unless those capabilities genuinely exist.

### Resume editor

The focused editor edits one resume section at a time.

Section navigation, focused editing and live preview are distinct conceptual
areas on desktop.

The document should remain the visual hero.

The editor should not become a collection of independent cards.

On mobile, the editor provides dedicated Edit and Preview modes.

Changing mode should not lose the user's current section or editing context.

### Section navigation

Section navigation communicates the structure of the current resume.

The active section uses a restrained selected state rather than a heavy card.

Section navigation must scale to all supported resume sections.

On mobile, do not assume every section name fits simultaneously within the
viewport.

### Resume preview

The preview represents the exportable document.

The product UI may use the Nuvitae editorial identity, but the displayed resume
uses the styling of its selected resume template.

Do not couple product tokens to resume-template styling.

The preview may use subtle elevation to communicate the physical page metaphor.

Persistent actions must never cover content that the user cannot subsequently
scroll into view.

### Import

The import surface should keep the file-selection action visually dominant.

Technical, privacy and provider information should remain available without
overwhelming the primary task.

Drag-and-drop states, selected-file states and validation errors should use the
same restrained product language.

Avoid turning supporting information into several competing cards.

### Import review

Review information should prioritize what requires user attention.

Ready information may recede visually.

Unresolved information should remain easy to locate.

Supporting provenance such as "Why am I seeing this?" is secondary and should
not dominate the review layout.

Statuses must be understandable without relying on color alone.

The review interface is visually distinct from the main resume editor.

### Processing states

Progress treatments communicate actual product state.

Do not create fake precision through decorative percentages or simulated
progress.

A processing screen may communicate completed, current and upcoming stages, but
the visual state must follow real application state.

Long-running, reconnecting and failed states should use the same visual
language as normal processing.

Avoid language that implies offline editing or synchronization where none
exists.

### Contextual AI

AI assistance appears close to the content it affects.

It should feel like an editing capability rather than a destination.

Do not create:

- a permanent AI navigation item;
- a global AI sidebar;
- a chatbot-first editing experience;
- decorative AI visual effects;
- a distinct AI visual identity competing with Nuvitae.

AI suggestions should preserve the surrounding editor layout.

The resume preview should not disappear merely because an AI suggestion is
being displayed.

### Design settings

Resume customization uses bounded, understandable choices.

Prefer visual presets and immediate preview feedback.

Do not expose:

- raw CSS;
- arbitrary canvas positioning;
- desktop-publishing controls;
- unnecessarily technical terminology.

Product UI settings and resume-template styling remain separate concerns.

On mobile, design settings may use a dedicated screen or sheet when this helps
preserve editing context.

### Export

Export should visually feel like the completion of the resume workflow.

The document, selected page size and export format must be clear.

Product UI should avoid unprovable claims about universal ATS compatibility.

Prefer truthful language such as:

- "ATS-conscious layout";
- "Designed for ATS readability".

Export actions belong to the currently opened resume rather than global product
navigation.

## Do's and Don'ts

### Do

- make the resume the visual hero;
- use typography and whitespace as primary hierarchy tools;
- keep product language simple;
- preserve one-section-at-a-time editing;
- distinguish product UI from resume-template styling;
- make keyboard focus clearly visible;
- design all states for keyboard and touch accessibility;
- use semantic colors consistently;
- preserve the Editorial Studio visual character across desktop and mobile;
- prefer semantic CSS custom properties over one-off values;
- keep global product navigation restrained;
- make contextual actions appear close to the content they affect;
- use real product state for progress and status representations;
- keep dense UI typography clean and highly readable;
- use elevation only where it communicates meaningful layering.

### Don't

- copy FlowCV layouts or branding;
- create a generic SaaS dashboard;
- use large rounded cards everywhere;
- add permanent AI chrome;
- use purple AI gradients or glassmorphism;
- imply cloud storage through visual or textual conventions;
- invent product functionality to fill empty space;
- make important controls hover-only;
- simulate progress;
- expose "Editorial Studio" to end users;
- style every resume using the Nuvitae application typography;
- treat Stitch-generated implementation code as production architecture;
- make Design or Export permanent global navigation destinations;
- turn the resume editor into one long form;
- use placeholders instead of persistent form labels;
- let persistent mobile controls cover unreachable document content.
