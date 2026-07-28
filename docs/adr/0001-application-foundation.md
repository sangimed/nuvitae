# Application Foundation

## Status

Accepted

Accepted date: 2026-07-28

Rationale: The architecture direction is accepted because the reviewed
governance artifacts consistently require Nuvitae to own its application,
domain, import, rendering, AI-operation, and user-experience boundaries while
using Reactive Resume and Resuml only as constrained references. Individual
source-code reuse decisions remain conditional on implementation spikes,
license review, dependency review, attribution planning, and API-boundary
review.

## Context

Nuvitae is a visual, AI-native resume builder for non-technical users. The default experience must be a guided visual editor, not resume-as-code (`.specify/memory/constitution.md:174`; `README.md:13`). The preferred onboarding path starts from importing an existing resume, reviewing extracted information, correcting errors, and approving the result before a master resume is created (`.specify/memory/constitution.md:48`; `specs/001-import-resume/spec.md:193`).

Structured resume data is the source of truth. PDFs are disposable generated artifacts and must never be directly edited (`.specify/memory/constitution.md:58`). AI may propose typed, validated changes, but users must review and approve them before permanent application (`.specify/memory/constitution.md:78`). The resume domain, import pipeline, and renderer must remain independent from any AI provider (`.specify/memory/constitution.md:132`).

Two reference repositories were evaluated:

- Reactive Resume: a full-stack visual resume builder with a pnpm/Turbo monorepo, custom `ResumeData`, visual editor, React-PDF templates, auth, persistence, MCP, AI provider settings, Docker Compose, and test infrastructure (`../nuvitae-research/reactive-resume/package.json:16`; `../nuvitae-research/reactive-resume/packages/db/src/schema/resume.ts:22`; `../nuvitae-research/reactive-resume/packages/pdf/src/server.tsx:15`; `../nuvitae-research/reactive-resume/compose.yml:3`).
- Resuml: a TypeScript package/CLI/MCP tool centered on YAML/JSON Resume, deterministic ATS analysis, job-description matching, Playwright PDF export, and agent workflows (`../nuvitae-research/resuml/package.json:18`; `../nuvitae-research/resuml/src/core.ts:16`; `../nuvitae-research/resuml/src/ats/index.ts:39`; `../nuvitae-research/resuml/src/mcp/server.ts:410`). Its README claims a hosted browser app with a form editor, but that deployed app was not evaluated as an application repository (`../nuvitae-research/resuml/README.md:19`).

## Decision Drivers

- Preserve a visual non-technical UX with no YAML, JSON, MCP, prompts, API keys, model internals, or command-line concepts in standard flows (`.specify/memory/constitution.md:38`).
- Support import-first onboarding with deterministic extraction first and optional AI only after deterministic extraction (`specs/001-import-resume/spec.md:15`; `specs/001-import-resume/spec.md:204`).
- Keep structured data as the only editable source of truth and generated documents disposable (`.specify/memory/constitution.md:58`).
- Require AI changes to be typed, validated, reviewable, non-destructive, and explicitly approved (`.specify/memory/constitution.md:78`).
- Keep templates protected and rendering independent from AI orchestration (`.specify/memory/constitution.md:99`).
- Preserve human readability and ATS readability with regression checks (`.specify/memory/constitution.md:109`; `.specify/memory/constitution.md:162`).
- Support both self-hosted community and managed cloud editions (`README.md:16`).
- Keep the domain independent from Codex, Claude, OpenAI, and future providers (`.specify/memory/constitution.md:132`).

## Options Considered

1. Fork Reactive Resume as the complete application foundation.
2. Build Nuvitae independently while selectively reusing compatible libraries, concepts, or isolated components.
3. Use Resuml as the primary foundation and build a visual product around it.
4. Use a hybrid architecture with Reactive Resume as the visual/rendering reference and Resuml as the agentic/ATS reference.

## Decision

Adopt Option 4 as a Nuvitae-owned hybrid architecture.

This does not mean composing Reactive Resume and Resuml directly as runtime foundations. Nuvitae will own the application shell, resume domain, import pipeline, rendering boundary, AI orchestration boundary, persistence model, and user experience. Reactive Resume will be used as the primary reference for visual editing, deterministic template rendering, PDF regeneration, auth/persistence patterns, MCP integration patterns, and self-hosting. Resuml will be used as the primary reference for ATS analysis, job-description matching, skill taxonomy, knockout signals, and agent workflow ergonomics.

This decision accepts the architecture direction, not blanket source-code reuse.
Nuvitae-specific import drafts, career inventory, master resume variants,
ChangeSets, tenant isolation, managed-cloud controls, and provider-independent AI
operations still require validation through implementation spikes before any
specific reused component is adopted.

The decision preserves these boundaries:

- Resume domain independent from UI.
- Resume domain independent from AI providers.
- Import pipeline independent from rendering.
- Rendering independent from AI orchestration.
- AI may only produce validated business operations.
- Generated documents are disposable artifacts.
- User-facing flows never expose code-oriented formats.

## Consequences

- Nuvitae will not inherit Reactive Resume's immediate AI-based PDF/DOCX import path, which requires a connected AI provider and creates a resume after parsing (`../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:162`; `../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:201`).
- Nuvitae will not expose Resuml's YAML-first workflow or MCP YAML tools to standard users (`../nuvitae-research/resuml/README.md:1`; `../nuvitae-research/resuml/src/mcp/server.ts:410`).
- Nuvitae can reuse the strongest evaluated ideas from each project while avoiding a domain model that is owned by either upstream.
- Initial implementation effort is higher than a fork. Long-term ownership is expected to be better only if extraction spikes prove narrow reuse boundaries and the core Nuvitae domain stays independent.
- Future direct code reuse must go through license, SBOM, dependency, attribution, and API-boundary review. Reactive Resume is MIT licensed (`../nuvitae-research/reactive-resume/LICENSE:1`), and Resuml is ISC licensed (`../nuvitae-research/resuml/LICENSE:1`), but copied templates, fonts, icons, ATS data, optional themes, generated assets, and transitive dependencies may carry separate obligations.
- Selective reuse may be harder than a fork for some components because Reactive Resume is a private workspace-coupled monorepo (`../nuvitae-research/reactive-resume/package.json:5`; `../nuvitae-research/reactive-resume/apps/web/package.json:35`) and its PDF path uses internal packages plus a patched React-PDF dependency (`../nuvitae-research/reactive-resume/packages/pdf/package.json:22`; `../nuvitae-research/reactive-resume/pnpm-workspace.yaml:5`).

## Risks and Mitigations

- Risk: the hybrid approach becomes an incoherent mix of incompatible schemas and renderers. Mitigation: define Nuvitae domain types and adapters first; keep Reactive Resume and Resuml formats behind explicit mapping boundaries.
- Risk: Reactive Resume extensibility is overestimated. Its schema mixes content with rendering metadata (`../nuvitae-research/reactive-resume/packages/schema/src/resume/data.ts:643`) and persistence stores that full blob as resume JSONB (`../nuvitae-research/reactive-resume/packages/db/src/schema/resume.ts:22`). Mitigation: do not adopt `ResumeData` as the Nuvitae domain; require adapters or rewrites for template/editor reuse.
- Risk: AI tools bypass review by applying patches directly. Mitigation: reject immediate-apply agent tools; only accept proposal-first ChangeSets with validation, provenance, diff, and explicit approval.
- Risk: template behavior becomes unsafe or non-deterministic through arbitrary CSS or third-party theme packages. Mitigation: ship vetted, versioned templates and validated configuration only.
- Risk: ATS scores become misleading product promises. Mitigation: present deterministic ATS checks as guidance and regression evidence, with explainable check results.
- Risk: self-hosting inherits unnecessary operational complexity. Reactive Resume's Compose stack includes Postgres, Redis, SeaweedFS, and the app (`../nuvitae-research/reactive-resume/compose.yml:3`); Resuml-style PDF export adds optional Playwright/Chromium (`../nuvitae-research/resuml/src/commands/pdf.ts:34`). Mitigation: design a minimal community deployment separately from managed-cloud infrastructure.
- Risk: import and multi-tenant security are underestimated. Reactive Resume local storage rejects private writes (`../nuvitae-research/reactive-resume/packages/api/src/features/storage/service.ts:140`), S3 writes default to public unless private is set (`../nuvitae-research/reactive-resume/packages/api/src/features/storage/service.ts:254`), and generic uploads return public URLs (`../nuvitae-research/reactive-resume/packages/api/src/features/storage/service.ts:345`). Mitigation: implement Nuvitae-specific upload/document parsing boundaries with tenant authorization, private storage defaults, parser sandboxing, malware scanning, egress controls, retention, deletion verification, immutable audit logs, rate limits, and secret isolation.
- Risk: fork maintenance is underestimated. A Reactive Resume fork would inherit pnpm/Turbo, React, TypeScript preview, Better Auth, ORPC, AI SDK providers, React-PDF, S3, Redis, and email infrastructure (`../nuvitae-research/reactive-resume/package.json:16`; `../nuvitae-research/reactive-resume/apps/web/package.json:18`; `../nuvitae-research/reactive-resume/apps/server/package.json:20`). Mitigation: keep Reactive Resume as a reference unless a deliberate downstream-product decision is made.

## Rejected Alternatives

Forking Reactive Resume is rejected as the complete foundation. It has strong visual/editor/rendering evidence, but its import path and agent behavior conflict with Nuvitae's deterministic import review and review-before-apply AI requirements (`../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:162`; `../nuvitae-research/reactive-resume/packages/api/src/features/agent/tools.ts:87`). A fork would also create excessive upstream divergence because Nuvitae changes cut through schema, persistence, import, AI/MCP, rendering, and UX.

Using Resuml as the primary foundation is rejected. Its ATS and MCP pieces are valuable, but it is a YAML/CLI/package-centered project without the inspected app-level foundation required for Nuvitae's non-technical visual product, cloud operation, auth, persistence, and import review (`../nuvitae-research/resuml/package.json:36`; `../nuvitae-research/resuml/src/index.ts:41`).

Option 2 alone is not selected because an independent build without explicit reference architecture would lose useful evidence from both repositories. Nuvitae should deliberately learn from Reactive Resume's visual/rendering implementation and Resuml's ATS implementation while still owning its domain. However, selective reuse remains conditional, not assumed; extraction spikes must prove that reused components do not drag in incompatible schemas, licenses, dependencies, or user-facing code formats.

## Validation Plan

- Produce a Nuvitae domain model covering career inventory, master resume, linked variants, import drafts, field provenance, and ChangeSets before application implementation.
- Prototype import adapters that produce sourced, reviewable structured fields from PDF/DOCX without requiring AI.
- Prototype rendering with at least one controlled template and verify deterministic PDF regeneration, pagination, selectable text, reading order, and ATS extraction.
- Build an ATS evaluation harness using Resuml-inspired checks mapped to Nuvitae domain data.
- Define AI provider adapter contracts that emit only validated business operations and cannot modify templates or generated documents.
- Define community and cloud deployment models, including auth, storage, upload isolation, retention, deletion, rate limits, and logging constraints.
- Add accessibility acceptance checks for import, review, editing, AI proposal review, template customization, and export flows.
- Port one Reactive Resume template concept without leaking `ResumeData`, UI state, or rendering metadata into the Nuvitae domain model.
- Map one Resuml ATS parsing check and one job-description match check to Nuvitae domain data without YAML or JSON Resume becoming user-facing formats.
- Run English, French, and bilingual import fixtures through deterministic extraction and measure field accuracy, provenance coverage, warnings, fallback behavior, and timeout behavior.
- Produce an SBOM and license report for any copied files, vendored modules, fonts, icons, themes, skill data, and transitive dependencies.
- Run tenant-isolation tests for resume records, import artifacts, object-storage keys, generated PDFs, AI messages, audit logs, deletion jobs, and rate limits.
- Run network-denied rendering and document-parsing tests to prove templates and upload processing cannot fetch arbitrary external resources.
- Estimate upstream-sync cost by replaying one meaningful Reactive Resume release delta against a Nuvitae-shaped fork or extraction spike.

## Revisit Conditions

- Reactive Resume implements import-first deterministic extraction, review drafts, provenance, retention/deletion semantics, and proposal-first AI operations compatible with Nuvitae.
- Resuml ships a production-ready visual/cloud application with protected templates, auth, persistence, upload isolation, and non-code user flows.
- Nuvitae's constitution changes to allow resume-as-code or provider-specific user journeys.
- Rendering validation shows React-PDF cannot satisfy deterministic, visually coherent, and ATS-readable output requirements.
- Legal review blocks direct or substantial reuse from either evaluated project.
- Extraction spikes show Reactive Resume templates/editor code cannot be reused without importing most of its schema, UI, font, and build stack.
- Security review requires isolation or compliance controls that make either reference architecture operationally unsuitable.
