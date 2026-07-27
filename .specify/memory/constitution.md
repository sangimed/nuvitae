<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Placeholder principles -> I. Non-Technical User Experience
- Placeholder principles -> II. Import-First Onboarding
- Placeholder principles -> III. Structured Data as Source of Truth
- Placeholder principles -> IV. Deterministic Document Generation
- Placeholder principles -> V. Non-Destructive and Reviewable AI Changes
- Placeholder principles -> VI. Factual Integrity and Provenance
- Placeholder principles -> VII. Protected Templates
- Placeholder principles -> VIII. Human Readability and ATS Readability
- Placeholder principles -> IX. Security and Privacy by Design
- Placeholder principles -> X. Provider-Independent AI Architecture
- Placeholder principles -> XI. Fully Usable Without AI
- Placeholder principles -> XII. Accessibility and Recovery
- Placeholder principles -> XIII. Quality Gates and Definition of Done
Added sections:
- Product Scope and Invariants
- Development Workflow and Review Gates
- Governance
Removed sections:
- Placeholder additional constraints section
- Placeholder development workflow section
Templates requiring updates:
- ✅ .specify/templates/plan-template.md
- ✅ .specify/templates/spec-template.md
- ✅ .specify/templates/tasks-template.md
- ✅ README.md reviewed; no update required
- ✅ .agents/skills/speckit-tasks/SKILL.md
- ✅ Other .agents/skills/speckit-* files reviewed; no update required
Follow-up TODOs: None
-->
# Nuvitae Constitution

## Core Principles

### I. Non-Technical User Experience
The standard Nuvitae user journey MUST be visual, guided, and understandable
without a technical background. YAML, JSON, MCP, prompts, API keys, model
internals, command-line concepts, and provider configuration MUST NOT appear in
the standard product experience. Any technical or administrative surface MUST be
separate from the default end-user flow and inaccessible by accident.

Rationale: Nuvitae exists for non-technical resume authors; technical concepts
inside the primary journey are product defects, not advanced-user features.

### II. Import-First Onboarding
The preferred onboarding journey MUST start from an existing resume whenever a
user has one. Users MUST be able to upload a previous resume, review extracted
information, correct extraction errors, and approve the result before a master
resume is created. Manual entry MUST remain available, but it MUST NOT be the
only onboarding path.

Rationale: Resume builders are most useful when they reduce first-session work
instead of requiring users to recreate information they already have.

### III. Structured Data as Source of Truth
Structured application data MUST be the sole editable source of truth for resume
content. PDF files and all other exported documents are generated artifacts.
Generated PDFs MUST NEVER be directly edited by users, application logic, import
logic, or AI systems. Any content correction MUST be represented as a validated
change to structured application data.

Rationale: A single editable data model prevents drift between the application,
AI operations, and exported documents.

### IV. Deterministic Document Generation
Every content or configuration change MUST regenerate documents through the
controlled rendering engine. Given the same structured content, template
version, rendering configuration, fonts, and rendering engine version, generation
MUST produce an equivalent document. Rendering differences caused by dependency
or environment changes MUST be detectable by regression checks.

Rationale: Users and reviewers must be able to trust that exports are reproducible
and that layout changes are deliberate.

### V. Non-Destructive and Reviewable AI Changes
AI systems MUST propose typed, validated business operations rather than freely
replacing a resume document. Proposed changes MUST be shown in a clear,
user-understandable diff and MUST require explicit user approval before they are
permanently applied. The master resume MUST NOT be silently overwritten. Rejected
AI proposals MUST leave existing structured data unchanged.

Rationale: AI assistance is valuable only when users remain in control of their
professional record.

### VI. Factual Integrity and Provenance
AI MUST NOT invent employers, dates, skills, technologies, responsibilities,
metrics, qualifications, certifications, awards, education, or achievements.
Substantial claims MUST be traceable to imported information or user-confirmed
information. Unverified, inferred, or missing information MUST be clearly marked
and MUST require user confirmation before export or use in an approved master
resume.

Rationale: Resume adaptation must improve presentation without compromising the
truthfulness of a user's work history.

### VII. Protected Templates
Content-related AI requests MUST NOT modify template source code, arbitrary CSS,
rendering components, or raw PDF structures. Design changes initiated by users or
AI MUST use predefined, validated configuration options only. Template source
changes MUST be treated as product development changes and reviewed through the
normal engineering workflow.

Rationale: Template boundaries keep AI operations predictable, testable, and safe
for document generation.

### VIII. Human Readability and ATS Readability
Every exportable resume MUST remain visually readable by humans and extractable
by recruitment automation and ATS parsers. Rendering changes MUST preserve
selectable text, deterministic reading order, readable typography, clear
headings, textual contact information, and correct associations between roles,
employers, dates, locations, and descriptions. No feature MAY solve layout
problems by reducing typography, margins, line height, or spacing below approved
readability limits.

Rationale: A resume that looks good but cannot be read accurately by people or
systems fails the core product outcome.

### IX. Security and Privacy by Design
Security and privacy MUST be addressed during specification and design, before
implementation begins. Every feature MUST consider personal-data processing,
authorization, input validation, file-upload security, secret management,
retention, deletion, logging, rate limiting, and resource isolation. Full resumes,
authentication tokens, provider credentials, and unnecessary personal data MUST
NOT be written to application logs.

Rationale: Resumes contain sensitive personal data, so privacy and abuse
resistance are baseline requirements.

### X. Provider-Independent AI Architecture
The resume domain, import pipeline, and rendering engine MUST remain independent
from Codex, OpenAI, Claude, or any single AI provider. Codex MAY be the first
supported personal assistant, but AI integration MUST be expressed through
provider adapters around stable domain operations. Provider-specific prompts,
transport details, credentials, and model choices MUST NOT leak into the core
resume data model or rendering engine.

Rationale: Nuvitae must remain portable across AI providers and fully govern its
own domain behavior.

### XI. Fully Usable Without AI
Import review, manual editing, template customization, and document export MUST
remain usable without an AI provider. AI features MAY improve speed or adaptation
quality, but they MUST NOT be required to create, edit, review, customize, or
export a resume.

Rationale: Users must not lose core product access because an AI provider is
unconfigured, unavailable, rate-limited, or unsuitable for their data.

### XII. Accessibility and Recovery
Core flows MUST provide accessible labels, keyboard navigation, understandable
progress states, recoverable errors, and explicit confirmation for destructive
actions. Upload, extraction review, editing, AI proposal review, template
customization, and export flows MUST expose success, pending, failure, retry, and
cancel states where those states can occur.

Rationale: Resume creation is a high-stakes workflow; users need accessible
controls and a clear path back from mistakes.

### XIII. Quality Gates and Definition of Done
A feature is not complete until its acceptance criteria, tests, security
implications, accessibility implications, documentation, and failure states are
addressed. Changes affecting rendering MUST pass document-generation,
pagination, text-extraction, and ATS-readability regression checks. Changes
affecting AI behavior MUST include representative evaluations covering missing
facts, prompt injection attempts, unsupported claims, provenance handling, and
rejected proposals.

Rationale: Nuvitae's quality depends on behavior that must be verified, not only
implemented.

## Product Scope and Invariants

Nuvitae is a visual, AI-native resume builder for non-technical users. Product
decisions MUST preserve these invariants:

- The default experience is a guided visual editor, not resume-as-code.
- Import review, structured editing, template configuration, and export are core
  product capabilities.
- AI is an assistant that proposes validated changes; it is not the owner of the
  resume document or rendering stack.
- Exported documents are generated from structured application data and validated
  rendering configuration.
- Privacy, security, accessibility, human readability, and ATS readability are
  product requirements, not optional hardening tasks.

## Development Workflow and Review Gates

Every feature specification MUST state how the feature affects non-technical UX,
import-first onboarding, structured resume data, deterministic rendering,
AI-reviewed operations, factual provenance, protected templates, ATS readability,
security, provider independence, no-AI usability, accessibility, and recovery.
If a principle is not applicable, the specification MUST explain why.

Every implementation plan MUST include a Constitution Check before Phase 0
research and repeat it after Phase 1 design. The plan MUST identify required
tests, evaluations, regression checks, documentation updates, and failure-state
handling before implementation tasks are generated.

Every task list MUST include concrete tasks for applicable quality gates. Work
that changes rendering MUST include document generation, pagination,
text-extraction, and ATS-readability regression tasks. Work that changes AI
behavior MUST include representative evaluation tasks for missing facts, prompt
injection, unsupported claims, provenance, and user approval flows.

Reviewers MUST block changes that violate a MUST principle unless an approved
constitutional exception is documented before merge. Reviewers MUST treat
unlogged security/privacy decisions, missing accessibility coverage, unreviewable
AI changes, direct PDF editing, and provider lock-in of core domain behavior as
release blockers.

## Governance

This constitution is the highest authority for Nuvitae product and engineering
decisions. Specifications, plans, tasks, code reviews, implementation decisions,
runtime guidance, and release decisions MUST comply with it. When another
document conflicts with this constitution, this constitution prevails.

Amendments MUST be proposed as an explicit constitution change that includes the
reason for the change, affected principles or governance rules, migration impact,
and updates required for dependent templates or guidance. Amendments MUST be
reviewed and approved by the project owner before they take effect. Application
feature work MUST NOT implicitly amend this constitution.

Constitution versioning MUST use semantic versioning:

- MAJOR version increments for backward-incompatible governance changes, removed
  principles, or redefined principles that invalidate prior compliant work.
- MINOR version increments for new principles, new mandatory sections, or
  materially expanded guidance.
- PATCH version increments for clarifications, wording fixes, typo fixes, or
  non-semantic refinements.

Constitution checks are mandatory during specification, planning, task
generation, code review, and release review. Each feature MUST document
constitution compliance and any approved exceptions in its spec or plan. Any
exception MUST identify the principle affected, the limited scope and duration of
the exception, the approving project owner, the mitigation plan, and the removal
or follow-up date. Exceptions MUST NOT permit direct editing of generated PDFs,
silent overwrites of the master resume, invented factual claims, logging of full
resumes or credentials, or inaccessible core flows.

**Version**: 1.0.0 | **Ratified**: 2026-07-27 | **Last Amended**: 2026-07-28
