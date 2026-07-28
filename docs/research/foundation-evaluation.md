# Nuvitae Foundation Evaluation

## Executive Summary

Recommendation: use Strategy D, but only as a Nuvitae-owned hybrid architecture: build Nuvitae independently, use Reactive Resume as the visual/editor/rendering reference, and use Resuml as the ATS/agentic workflow reference. Do not fork either application as the complete foundation.

This recommendation is architectural, not a claim that either repository already implements Nuvitae's required boundaries. The most important Nuvitae capabilities - import drafts, career inventory, master resume variants, ChangeSets, provider-independent AI adapters, tenant isolation, and managed-cloud controls - must still be designed and validated in Nuvitae.

Reactive Resume is the stronger visual product and full-stack application reference. It has a visual builder, custom resume schema, React-PDF template system, PDF export, auth, persistence, MCP, provider settings, Docker Compose, and test infrastructure. The most relevant evidence is its monorepo structure and scripts (`../nuvitae-research/reactive-resume/package.json:16`), typed resume data stored as Postgres JSONB (`../nuvitae-research/reactive-resume/packages/db/src/schema/resume.ts:22`), React-PDF PDF generation (`../nuvitae-research/reactive-resume/packages/pdf/src/server.tsx:15`), and self-hosting Compose services (`../nuvitae-research/reactive-resume/compose.yml:3`).

Reactive Resume is not a clean drop-in foundation for Nuvitae. Its import path creates a resume after AI parsing for PDF/DOCX (`../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:162`), while Nuvitae requires deterministic extraction first, user review, source retention/deletion rules, and explicit confirmation before structured resume creation (`specs/001-import-resume/spec.md:193`). Its agent path can apply resume patches immediately (`../nuvitae-research/reactive-resume/packages/api/src/features/agent/tools.ts:87`), while Nuvitae requires AI proposals to be reviewable before permanent application (`.specify/memory/constitution.md:78`).

Resuml is the stronger reference for deterministic ATS scoring, JSON Resume compatibility, and agent-facing tools. It is a single TypeScript package with CLI/MCP exports (`../nuvitae-research/resuml/package.json:18`), parses YAML into JSON Resume and validates through `@jsonresume/schema` (`../nuvitae-research/resuml/src/core.ts:16`), and has a deterministic ATS engine with parsing, recruiter, and job-description match tiers (`../nuvitae-research/resuml/src/ats/index.ts:39`). It is not an application foundation for Nuvitae because its default product model is resume-as-code/YAML (`../nuvitae-research/resuml/README.md:1`) and its MCP tools exchange YAML strings (`../nuvitae-research/resuml/src/mcp/server.ts:410`), which Nuvitae explicitly excludes from the standard user journey (`.specify/memory/constitution.md:38`).

The main architecture decision is therefore to own the Nuvitae domain model, import draft model, ChangeSet model, provider adapter boundary, and product UX. Reuse should be limited to compatible ideas, algorithms, test approaches, and possibly isolated modules after license, dependency, security, and API-boundary review. "Reuse" must not be treated as free extraction of private workspace packages or templates.

## Nuvitae Constraints

Nuvitae's primary user flow is visual and for non-technical users; YAML, JSON, MCP, prompts, API keys, model internals, and command-line concepts must not appear in the standard product experience (`.specify/memory/constitution.md:38`). The README also says Nuvitae is not a resume-as-code product and that technical formats and AI-provider configuration must stay outside the standard journey (`README.md:13`).

Nuvitae requires import-first onboarding with upload, extraction review, correction, and approval before creating the master resume (`.specify/memory/constitution.md:48`). The import spec requires PDF and DOCX only for the initial release, French/English/bilingual support, selectable text, 10 MB and 5-page limits, deterministic extraction first, optional AI only after deterministic extraction, a 3-minute timeout, and reviewable partial results (`specs/001-import-resume/spec.md:15`).

Structured data is the only editable source of truth. PDFs are generated artifacts and must never be directly edited (`.specify/memory/constitution.md:58`). AI must propose typed, validated business operations that are shown in a user-understandable diff and require approval before permanent application (`.specify/memory/constitution.md:78`). Templates are protected from content-related AI changes (`.specify/memory/constitution.md:99`), rendering must preserve human and ATS readability (`.specify/memory/constitution.md:109`), and the resume domain, import pipeline, and renderer must remain provider-independent (`.specify/memory/constitution.md:132`).

## Reactive Resume Analysis

Reactive Resume is a full-stack pnpm/Turbo monorepo with `apps/*`, `packages/*`, and `tooling` workspaces (`../nuvitae-research/reactive-resume/package.json:16`; `../nuvitae-research/reactive-resume/pnpm-workspace.yaml:1`). It provides scripts for build, typecheck, Vitest, Playwright e2e, and agent tests (`../nuvitae-research/reactive-resume/package.json:22`).

The monorepo is not packaged as independently reusable public libraries. The root package is private (`../nuvitae-research/reactive-resume/package.json:5`), the web app depends on many internal `@reactive-resume/*` workspace packages (`../nuvitae-research/reactive-resume/apps/web/package.json:35`), and the PDF package depends on internal schema, fonts, and utilities (`../nuvitae-research/reactive-resume/packages/pdf/package.json:22`). The workspace also carries a patched `@react-pdf/textkit` dependency (`../nuvitae-research/reactive-resume/pnpm-workspace.yaml:5`). This means selective code reuse may require vendoring, dependency extraction, or substantial adaptation; in some slices it may be harder than a fork.

The data model is a custom `ResumeData`, not plain JSON Resume. It includes basics, picture, summary, built-in sections, custom sections, metadata, typography, layout pages, page settings, design, and style rules (`../nuvitae-research/reactive-resume/packages/schema/src/resume/data.ts:85`; `../nuvitae-research/reactive-resume/packages/schema/src/resume/data.ts:416`). Multiple roles under an employer are represented through `experienceItem.roles` (`../nuvitae-research/reactive-resume/packages/schema/src/resume/data.ts:151`). This aligns partly with Nuvitae's need to preserve multiple roles under one employer, but the model lacks Nuvitae import review statuses, source references, and long-lived master-resume inventory concepts. It also mixes resume content with rendering configuration under the same schema (`../nuvitae-research/reactive-resume/packages/schema/src/resume/data.ts:643`), which conflicts with Nuvitae's required separation between domain, UI, and rendering unless an adapter boundary is introduced.

Persistence stores each resume as a Postgres row with a typed JSONB `data` column, owner, public/locked/password metadata, and timestamps (`../nuvitae-research/reactive-resume/packages/db/src/schema/resume.ts:8`). Version history stores immutable `ResumeData` snapshots for milestones including template change, import, AI edit, and manual save (`../nuvitae-research/reactive-resume/packages/db/src/schema/resume.ts:47`). This is useful as an audit/snapshot pattern, but Nuvitae still needs a more explicit domain model for career inventory, master resume, linked variants, import draft, source deletion, and ChangeSet provenance.

The editor state is mature. The builder uses Zustand and Immer, whole-resume undo/redo snapshots, bounded history, autosave debounce, save status, locked-resume checks, and remote update handling (`../nuvitae-research/reactive-resume/apps/web/src/features/resume/builder/draft.ts:31`; `../nuvitae-research/reactive-resume/apps/web/src/features/resume/builder/draft.ts:79`; `../nuvitae-research/reactive-resume/apps/web/src/features/resume/builder/draft.ts:414`). This is strong evidence for using Reactive Resume as a visual editor reference.

Templates are first-class. The schema enumerates 15 built-in templates (`../nuvitae-research/reactive-resume/packages/schema/src/templates.ts:3`), implemented as React-PDF page components under `packages/pdf/src/templates`. `ResumeDocument` renders selected template pages from structured `ResumeData`, registers fonts, sets document metadata, and maps configured layout pages (`../nuvitae-research/reactive-resume/packages/pdf/src/document.tsx:34`). Server PDF export renders a React element to a PDF buffer and returns a `File` (`../nuvitae-research/reactive-resume/packages/pdf/src/server.tsx:15`). This is the best evaluated rendering reference, but not yet proven as Nuvitae's rendering foundation. Nuvitae still must prove template extraction quality, reading order, pagination stability, font licensing, and whether React-PDF plus the patched text layout dependency can satisfy ATS-readability and deterministic layout requirements.

Import is not compatible with Nuvitae's first feature as-is. The import dialog supports JSON formats plus PDF and DOCX, but PDF/DOCX import requires a connected AI provider (`../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:162`; `../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:174`; `../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:382`). It converts the file to base64, calls AI parse endpoints, then creates a resume immediately (`../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:167`; `../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:201`). Nuvitae instead requires deterministic extraction first, a review draft, source traceability, warning resolution, and explicit confirmation before structured resume creation (`specs/001-import-resume/spec.md:180`; `specs/001-import-resume/spec.md:193`).

AI support is broad but not aligned enough to own Nuvitae's domain. Reactive Resume enumerates many providers including OpenAI, Anthropic, Gemini, OpenRouter, Mistral, Ollama, and OpenAI-compatible endpoints (`../nuvitae-research/reactive-resume/packages/ai/src/types.ts:3`). Its chat path can validate proposed JSON Patch operations before applying (`../nuvitae-research/reactive-resume/packages/ai/src/tools/patch-proposal.ts:4`; `../nuvitae-research/reactive-resume/packages/api/src/features/ai/service.ts:350`). Its agent path defines an `apply_resume_patch` tool that applies JSON Patch operations immediately (`../nuvitae-research/reactive-resume/packages/api/src/features/agent/tools.ts:87`; `../nuvitae-research/reactive-resume/packages/api/src/features/agent/service.ts:681`) and then allows rollback from stored snapshots (`../nuvitae-research/reactive-resume/packages/api/src/features/agent/service.ts:1287`). For Nuvitae, this should be converted into proposal-first ChangeSets, not adopted directly.

The MCP server exposes authenticated resume operations over an LLM-facing interface. Its server instructions tell clients to read resume JSON, apply JSON Patch, create PDF URLs, and import full `ResumeData` JSON (`../nuvitae-research/reactive-resume/apps/server/src/mcp/server.ts:48`). Tools include list, get, import, patch, update, and PDF download (`../nuvitae-research/reactive-resume/packages/mcp/src/tools.ts:106`). This is useful for Codex integration patterns, but Nuvitae must keep MCP and JSON out of the default user experience.

Reactive Resume has production-shaped auth, persistence, and self-hosting. The auth schema covers users, sessions, accounts, two-factor, and passkeys (`../nuvitae-research/reactive-resume/packages/db/src/schema/auth.ts:11`). Docker Compose includes Postgres, Redis, SeaweedFS/S3 setup, and the app service (`../nuvitae-research/reactive-resume/compose.yml:3`; `../nuvitae-research/reactive-resume/compose.yml:80`). Storage supports local files and S3, with private S3 writes but no private local backend (`../nuvitae-research/reactive-resume/packages/api/src/features/storage/service.ts:116`; `../nuvitae-research/reactive-resume/packages/api/src/features/storage/service.ts:254`). Static uploads block private agent paths and set security headers (`../nuvitae-research/reactive-resume/apps/server/src/static/uploads.ts:5`). These are useful operational references, but Nuvitae's import pipeline needs stricter upload isolation, retention, and deletion semantics.

The fork-maintenance cost is high. A fork would inherit a fast-moving dependency surface across pnpm, Turbo, React, Vite, TanStack Router/Query/Form, Better Auth, ORPC, Drizzle, React-PDF, AI SDK providers, S3, Redis, and email infrastructure (`../nuvitae-research/reactive-resume/apps/web/package.json:18`; `../nuvitae-research/reactive-resume/apps/server/package.json:20`). Nuvitae's required changes are not cosmetic; they cut through schema, persistence, import, AI, MCP, rendering, and UX. That makes upstream merges difficult and creates a long-term downstream product rather than a lightly customized fork.

Reactive Resume has meaningful test infrastructure. The root scripts include `test`, `test:coverage`, `test:ci`, `test:e2e`, and `test:agent` (`../nuvitae-research/reactive-resume/package.json:35`). This supports maintainability as a reference, but this evaluation did not perform a coverage audit proving that the exact Nuvitae risks - deterministic import, ATS extraction, tenant isolation, and review-before-apply AI - are covered.

Accessibility evidence is useful but incomplete. Reactive Resume includes a visually hidden, screen-reader-readable mirror for the live resume preview because the rasterized PDF canvas is opaque to assistive technology (`../nuvitae-research/reactive-resume/apps/web/src/features/resume/preview/resume-accessible-text.tsx:241`). That is a good pattern for Nuvitae, but it is not evidence of full flow-level accessibility across import, review, template editing, AI proposal review, and export. Its MIT license permits reuse with copyright and permission notice retention (`../nuvitae-research/reactive-resume/LICENSE:1`).

## Resuml Analysis

Resuml is a smaller TypeScript package, not a full managed web application. Its package exports library subpaths for ATS, skills, MCP, and jobs, provides a `resuml` CLI binary, requires Node 20+, and uses Vitest for tests (`../nuvitae-research/resuml/package.json:18`; `../nuvitae-research/resuml/package.json:36`; `../nuvitae-research/resuml/package.json:52`; `../nuvitae-research/resuml/package.json:104`).

Its default structured format is YAML that is parsed, merged, and validated as JSON Resume (`../nuvitae-research/resuml/src/core.ts:16`; `../nuvitae-research/resuml/src/core.ts:48`). The generated TypeScript type follows the JSON Resume schema with `basics`, `work`, `education`, `skills`, and related sections (`../nuvitae-research/resuml/src/types/resume.ts:13`). This is useful as an interchange/reference model, but Nuvitae needs richer domain entities for career inventory, master resume, variants, field provenance, import review state, and typed operations.

The product stance is resume-as-code. The README headline says "YAML in" and presents CLI/MCP usage (`../nuvitae-research/resuml/README.md:1`; `../nuvitae-research/resuml/README.md:23`; `../nuvitae-research/resuml/README.md:64`). It mentions a browser app with YAML or form editor and local browser storage (`../nuvitae-research/resuml/README.md:19`), but that deployed app was not evaluated as a foundation repository. The inspected source is package/CLI/MCP oriented; it does not contain app-level auth, database, cloud tenancy, or an import-draft system. The available CLI commands are validate, tojson, render, dev, init, pdf, themes, mcp, ats, and jobs (`../nuvitae-research/resuml/src/index.ts:41`; `../nuvitae-research/resuml/src/index.ts:96`; `../nuvitae-research/resuml/src/index.ts:141`). Therefore Resuml's suitability for non-technical users remains unproven for Nuvitae; only its package-level ATS and agent workflows are evaluated here.

Rendering is theme-package based. Resuml can load `jsonresume-theme-*` or `@resuml/theme-*` modules (`../nuvitae-research/resuml/src/utils/themeLoader.ts:34`). The loader can auto-install missing JSON Resume themes with a host package-manager command (`../nuvitae-research/resuml/src/utils/themeLoader.ts:60`), which conflicts with Nuvitae's protected-template boundary and container-only development rule unless disabled and replaced with vetted templates installed through project containers. HTML rendering delegates to external theme packages (`../nuvitae-research/resuml/src/utils/themeRender.ts:24`). PDF export uses optional Playwright Chromium over rendered HTML (`../nuvitae-research/resuml/src/commands/pdf.ts:34`; `../nuvitae-research/resuml/src/commands/pdf.ts:98`), and warns if rendered body text appears too low relative to resume word count or if PDF size exceeds 2.5 MB (`../nuvitae-research/resuml/src/commands/pdf.ts:103`; `../nuvitae-research/resuml/src/commands/pdf.ts:138`). These checks are useful, but the rendering foundation is less controlled than Reactive Resume's typed React-PDF templates. If Nuvitae reused Resuml's theme path, Playwright/Chromium, third-party theme package licensing, network denial, sandboxing, container packaging, and deterministic rendering would become first-order operational concerns.

The ATS engine is the main reusable value. `analyzeAts` runs parsing checks, recruiter checks, optional job-description match checks, weighted scoring, knockout extraction, and a role-mismatch cap (`../nuvitae-research/resuml/src/ats/index.ts:39`; `../nuvitae-research/resuml/src/ats/index.ts:69`). The rubric records check IDs, tiers, weights, evidence levels, descriptions, and source URLs (`../nuvitae-research/resuml/src/ats/rubric.ts:3`). Checks include conventional sections, ISO date consistency, contact fields, reverse chronological work order, and education completeness (`../nuvitae-research/resuml/src/ats/checks/parsing.ts:8`). Recruiter checks include summary length, action-verb starts, quantification density, pronoun leakage, bullets per role, word count, highlight length, LinkedIn, and skills population (`../nuvitae-research/resuml/src/ats/checks/recruiter.ts:338`).

Job-description matching is deterministic and skill-taxonomy driven. It scans resume text from structured fields (`../nuvitae-research/resuml/src/ats/jdMatcher.ts:14`), splits job descriptions into requirement and non-requirement sections (`../nuvitae-research/resuml/src/ats/jdMatcher.ts:51`), ranks matched skills, caps to the top 25, and computes matched/missing/extra skills (`../nuvitae-research/resuml/src/ats/jdMatcher.ts:137`). The skill index is bundled from a JSON skill database (`../nuvitae-research/resuml/src/ats/skills/index.ts:1`). Knockout signals cover work authorization, location, clearance, and certification (`../nuvitae-research/resuml/src/ats/checks/match.ts:336`).

The MCP server is useful as an agent workflow reference but unsuitable as the end-user interface. It registers schema/rubric/theme resources (`../nuvitae-research/resuml/src/mcp/server.ts:153`), prompts for tailoring and optimizing YAML (`../nuvitae-research/resuml/src/mcp/server.ts:228`; `../nuvitae-research/resuml/src/mcp/server.ts:286`), and tools for init, validate, ATS, render, PDF, jobs search, jobs score, and tailor prompt (`../nuvitae-research/resuml/src/mcp/server.ts:387`; `../nuvitae-research/resuml/src/mcp/server.ts:446`; `../nuvitae-research/resuml/src/mcp/server.ts:583`; `../nuvitae-research/resuml/src/mcp/server.ts:673`). These tools pass YAML strings and rendered artifacts, not typed Nuvitae business operations.

Job search and adaptation are heuristic and prompt-driven. The search pipeline derives a query from the resume, fans out to free providers, filters and deduplicates postings, scores with the ATS engine, and applies a minimum-score threshold (`../nuvitae-research/resuml/src/jobs/index.ts:32`; `../nuvitae-research/resuml/src/jobs/index.ts:44`). Tailoring returns a prompt asking an agent to validate and ATS-check changes (`../nuvitae-research/resuml/src/jobs/index.ts:140`). This is useful later, but it should not be Nuvitae's ChangeSet mechanism.

Resuml is ISC licensed, requiring the copyright and permission notice in copies (`../nuvitae-research/resuml/LICENSE:1`). That covers Resuml itself, not automatically every optional theme, job provider, skill database source, generated asset, or transitive dependency that Nuvitae might package. Reactive Resume is MIT licensed (`../nuvitae-research/reactive-resume/LICENSE:1`), but its templates, fonts, patched dependencies, and internal package graph still require attribution and dependency-license review before any direct reuse.

## Strategy Comparison Matrix

Scores are relative foundation fit for Nuvitae: 5 is strongest, 1 is weakest. These are not claims that Nuvitae-specific features already exist in the reference repositories. Scores are lower where the strategy depends on capabilities that must still be built or where repository evidence is weak.

| Criterion | A. Fork Reactive Resume | B. Independent + selective reuse | C. Resuml primary | D. Hybrid references |
|---|---:|---:|---:|---:|
| 1. Visual UX for non-technical users | 4 | 3 | 2 | 4 |
| 2. Existing resume editor capabilities | 5 | 2 | 1 | 4 |
| 3. Template system and deterministic PDF generation | 4 | 3 | 2 | 4 |
| 4. ATS-readable rendering and extraction testing | 2 | 3 | 3 | 4 |
| 5. Import-first onboarding | 2 | 3 | 1 | 4 |
| 6. Career inventory, master resume, linked variants | 2 | 3 | 2 | 3 |
| 7. Controlled AI ChangeSets and provenance | 2 | 3 | 2 | 3 |
| 8. Provider-independent AI adapters | 3 | 3 | 2 | 3 |
| 9. Self-hosted community packaging | 5 | 3 | 2 | 4 |
| 10. Managed multi-user cloud operation | 2 | 3 | 1 | 3 |
| 11. Upload/document parsing security boundaries | 2 | 3 | 1 | 3 |
| 12. Accessibility | 2 | 2 | 1 | 2 |
| 13. Database/domain-model extensibility | 2 | 3 | 1 | 3 |
| 14. Testing and maintainability | 3 | 2 | 2 | 3 |
| 15. Upgrade path/upstream divergence | 2 | 3 | 3 | 3 |
| 16. License obligations/attribution | 3 | 3 | 2 | 2 |
| 17. Operational complexity | 2 | 3 | 3 | 2 |
| 18. Effort and long-term ownership | 2 | 2 | 2 | 3 |

## Strategy Assessment

### A. Fork Reactive Resume

Strengths: fastest path to a visual resume builder, editor state, templates, PDF generation, auth, persistence, MCP, and Docker self-hosting. Reactive Resume already has the app-level surface that Resuml lacks.

Weaknesses: high upstream divergence is likely because Nuvitae's import-first review model, career inventory, master resume and variants, ChangeSets, provider boundary, and non-technical UX are core product differences. Forking would inherit a single resume JSONB model (`../nuvitae-research/reactive-resume/packages/db/src/schema/resume.ts:22`) and import flow that uses AI parsing before immediate resume creation (`../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:162`), both of which conflict with Nuvitae's import spec (`specs/001-import-resume/spec.md:193`).

Verdict: not recommended.

### B. Build Independently With Selective Reuse

Strengths: best control over Nuvitae's domain boundaries, onboarding, import pipeline, ChangeSets, cloud/community split, and provider independence. It allows adopting compatible techniques from both projects without inheriting their product assumptions.

Weaknesses: higher initial implementation effort than a fork, especially for visual editing and deterministic rendering. Nuvitae would need to build or adapt the editor, templates, import, persistence, auth, and testing layers deliberately. Selective reuse can also be harder than it sounds: Reactive Resume packages are private workspace packages with internal dependencies, and Resuml's theme/PDF path depends on external theme packages and optional Playwright.

Verdict: viable, and effectively required for Nuvitae-specific domain ownership.

### C. Use Resuml as Primary Foundation

Strengths: strong structured resume compatibility, deterministic ATS analysis, CLI/MCP tooling, and low operational complexity as a package. Its ATS engine is an excellent reference.

Weaknesses: poor product fit as the primary foundation. Resuml's center of gravity is YAML, CLI, MCP, and theme packages (`../nuvitae-research/resuml/README.md:23`; `../nuvitae-research/resuml/src/mcp/server.ts:410`). It lacks the app, auth, persistence, visual editor, import review, upload isolation, and managed multi-user cloud model required by Nuvitae.

The README's hosted browser-app claim does not change this conclusion because this evaluation is based on the inspected repository. If the browser app source becomes available and proves a non-technical visual workflow, Resuml should be re-evaluated.

Verdict: not recommended.

### D. Hybrid Architecture

Strengths: best fit if interpreted as Nuvitae-owned architecture, not as direct composition. Reactive Resume supplies the strongest evidence for visual editing, React-PDF templates, PDF regeneration, app packaging, auth, and self-hosting. Resuml supplies the strongest evidence for deterministic ATS scoring, job-description matching, skill taxonomy, and agent workflow prompts. Nuvitae owns the domain model, import pipeline, ChangeSets, provenance, provider adapters, and user experience.

Weaknesses: requires discipline. The architecture can become incoherent if it tries to directly combine Reactive Resume's custom `ResumeData`, Resuml's JSON Resume/YAML model, React-PDF templates, Playwright/HTML theme rendering, JSON Patch agents, and MCP tools without a Nuvitae domain boundary. It also increases validation burden because Nuvitae must prove that the independently built domain, renderer, import pipeline, ATS harness, and AI operation model work together.

Verdict: recommended.

## Major Risks

- Domain contamination: Reactive Resume's `ResumeData` and Resuml's JSON Resume/YAML format could leak into Nuvitae's core domain or user flow. Mitigation: define Nuvitae domain types first; use adapters at import/export/ATS/render boundaries.
- Import mismatch: Reactive Resume's PDF/DOCX import depends on AI provider availability (`../nuvitae-research/reactive-resume/apps/web/src/dialogs/resume/import.tsx:162`), while Nuvitae requires deterministic extraction first (`specs/001-import-resume/spec.md:204`). Mitigation: implement a Nuvitae-specific import pipeline.
- AI safety mismatch: Reactive Resume's agent can apply patches immediately (`../nuvitae-research/reactive-resume/packages/api/src/features/agent/tools.ts:87`), while Nuvitae requires review-before-apply (`.specify/memory/constitution.md:78`). Mitigation: AI adapters may only emit validated ChangeSets with provenance and preview diffs.
- Template safety: Resuml can auto-install theme packages (`../nuvitae-research/resuml/src/utils/themeLoader.ts:60`), which conflicts with protected templates. Mitigation: ship only vetted, versioned templates and validated configuration options.
- ATS overconfidence: Resuml's ATS is deterministic and useful, but heuristic. Mitigation: report ATS checks as guidance and regression signals, not as a guarantee of ATS success.
- Operational overreach: Reactive Resume's Compose stack includes Postgres, Redis, and SeaweedFS (`../nuvitae-research/reactive-resume/compose.yml:3`). Mitigation: choose the minimum community stack and separately design managed-cloud isolation.
- Combined operational complexity: Strategy D can require Postgres, Redis, object storage, parser isolation, PDF rendering workers, Playwright/Chromium if Resuml-style PDF checks are used, MCP services, AI-provider egress controls, rate limits, background jobs, observability, and PDF regression infrastructure. Mitigation: validate deployment topology before accepting the ADR.
- License drift: MIT and ISC permit reuse with notices, but direct copying would impose attribution tracking. Optional themes, fonts, patched dependencies, skill databases, and generated assets may carry separate obligations. Mitigation: require SBOM generation, dependency-license scanning, copied-file inventory, attribution notices, and legal review before vendoring.
- Selective reuse drag: extracting Reactive Resume templates or editor code can pull in private workspace packages, schema assumptions, patched React-PDF internals, fonts, UI components, and localization. Mitigation: prefer copying concepts first; allow code reuse only after an extraction spike proves a narrow dependency boundary.
- Fork divergence: a Reactive Resume fork would need deep changes across schema, persistence, import, AI/MCP, rendering, and UX to satisfy Nuvitae. Mitigation: reject fork unless Nuvitae intentionally prioritizes fastest launch over architectural fit.
- Multi-tenant security gaps: neither evaluated repository proves Nuvitae's managed-cloud tenant isolation, private upload storage, parser sandboxing, malware scanning, deletion verification, audit immutability, provider-egress controls, or per-tenant rate limits. Mitigation: treat these as first-class architecture work, not inherited capabilities.

## Estimated Relative Effort

| Strategy | Initial effort | Long-term ownership | Notes |
|---|---:|---:|---|
| A. Fork Reactive Resume | Medium | Very high | Fast visual start, but likely permanent downstream ownership because Nuvitae cuts across schema, import, AI, MCP, rendering, and cloud concerns. |
| B. Independent + selective reuse | High | Medium-high | More upfront work and selective reuse may be difficult, but ownership is cleaner once boundaries are proven. |
| C. Resuml primary | High | High | Must build almost the whole visual/cloud product around a CLI/package core. |
| D. Hybrid references | High | Medium-high | Best balance if Nuvitae owns core boundaries, treats both repos as references first, and validates reuse before committing. |

## Elements Suitable for Reuse

- Reactive Resume visual builder patterns: editor layout, undo/redo/autosave approach, locked-resume behavior, remote update handling (`../nuvitae-research/reactive-resume/apps/web/src/features/resume/builder/draft.ts:414`). Direct code reuse requires an extraction spike because the web app depends on many internal packages (`../nuvitae-research/reactive-resume/apps/web/package.json:35`).
- Reactive Resume rendering concepts: typed templates, React-PDF renderer, server-side PDF regeneration, font registration, page layout metadata (`../nuvitae-research/reactive-resume/packages/pdf/src/document.tsx:34`; `../nuvitae-research/reactive-resume/packages/pdf/src/server.tsx:15`). Direct template reuse requires license, font, dependency, and ATS extraction review.
- Reactive Resume import adapters for JSON Resume or legacy Reactive Resume JSON as optional admin/import utilities, not as the first PDF/DOCX import path (`../nuvitae-research/reactive-resume/packages/import/src/reactive-resume-json.tsx:67`).
- Reactive Resume patch validation concepts, after replacing raw JSON Patch with Nuvitae business operations where needed (`../nuvitae-research/reactive-resume/packages/resume/src/patch.ts:12`).
- Reactive Resume self-hosting reference: Postgres, Redis, object storage, health checks, non-root Docker runtime (`../nuvitae-research/reactive-resume/Dockerfile:41`; `../nuvitae-research/reactive-resume/compose.yml:80`).
- Resuml ATS scoring concepts: tiered checks, skill taxonomy, JD matching, role mismatch cap, knockout signals (`../nuvitae-research/resuml/src/ats/index.ts:39`; `../nuvitae-research/resuml/src/ats/jdMatcher.ts:119`).
- Resuml PDF validation ideas: selectable text and size warnings (`../nuvitae-research/resuml/src/commands/pdf.ts:103`; `../nuvitae-research/resuml/src/commands/pdf.ts:138`). These are heuristics, not a complete ATS validation suite.
- Resuml MCP/resource organization as a reference for agent-facing documentation and tools, with Nuvitae-specific typed operations (`../nuvitae-research/resuml/src/mcp/server.ts:153`; `../nuvitae-research/resuml/src/mcp/server.ts:446`).

## Elements That Must Remain Nuvitae-Specific

- Domain model for career inventory, master resume, variants, structured resume facts, provenance, and review state.
- Import pipeline for PDF/DOCX validation, deterministic extraction, source isolation, source references, warning resolution, 7-day retention, deletion, timeout, and manual fallback.
- AI ChangeSet model: typed business operations, validation, provenance, user-understandable diff, approval/rejection, and non-destructive storage.
- Provider adapter boundary for Codex first and Claude/others later.
- Template governance: approved templates, versioned rendering configuration, ATS-readable constraints, and no arbitrary user/AI CSS.
- Managed cloud tenancy, billing/subscription boundaries if added later, resource isolation, audit logging, retention, and deletion controls.
- User-facing UX: visual, FlowCV-simple, no code-oriented formats in standard flows.
- Security architecture for untrusted resume uploads, including parser sandboxing, malware scanning, content-type verification, storage privacy, egress limits, deletion verification, audit immutability, and tenant isolation.

## Recommended Strategy

Adopt Strategy D as a Nuvitae-owned hybrid architecture:

- Build the application, resume domain, import pipeline, rendering boundary, AI orchestration boundary, and persistence model independently.
- Use Reactive Resume as the primary reference for visual editing, template authoring, deterministic PDF regeneration, app packaging, auth/persistence patterns, and self-hosting.
- Use Resuml as the primary reference for ATS scoring, JD matching, skill taxonomy, knockout checks, and agent workflow ergonomics.
- Allow future isolated code reuse only after license review, SBOM/dependency review, attribution planning, API-boundary review, extraction spikes, and tests proving the reused component does not expose code-oriented formats or bypass Nuvitae review flows.
- Treat the comparison matrix as a validation backlog: lower-scored areas need proof before this ADR can move from Proposed to Accepted.

## Validation Backlog

- Port one Reactive Resume template concept into a Nuvitae-owned renderer without leaking `ResumeData`, UI state, or template metadata into the domain model.
- Map at least one Resuml ATS parsing check and one job-description match check to Nuvitae domain data without YAML or JSON Resume becoming the user-facing model.
- Run English, French, and bilingual import fixtures through deterministic PDF/DOCX extraction and measure field accuracy, provenance coverage, warning rates, and timeout behavior.
- Produce an SBOM and license report covering any copied files, vendored modules, fonts, icons, themes, skill data, and transitive dependencies.
- Run tenant-isolation tests for resume records, import artifacts, object storage keys, generated PDFs, AI messages, audit logs, and deletion jobs.
- Run network-denied rendering and document-parsing tests to prove templates and upload processing cannot fetch arbitrary external resources.
- Estimate upstream-sync cost by replaying one meaningful Reactive Resume release delta onto a Nuvitae-shaped branch or extraction spike.
- Verify accessibility with keyboard-only, screen-reader, focus management, error recovery, and reduced-motion checks across import, review, editor, AI proposal review, template settings, and export.

## Conditions That Could Invalidate This Recommendation

- Reactive Resume adopts an import-first deterministic pipeline with source provenance, review drafts, retention/deletion semantics, and proposal-first AI operations matching Nuvitae's constitution.
- Resuml ships a production-ready visual/cloud application with auth, persistence, upload isolation, import review, protected templates, accessibility gates, and non-code default UX.
- Nuvitae intentionally pivots to resume-as-code or technical users, invalidating the current constitution and README constraints.
- Nuvitae decides to optimize for fastest self-hosted launch over product/domain fit, accepting upstream divergence and later migration cost.
- Legal review rejects reuse of either project's code or assets beyond conceptual reference.
- Rendering regression work proves React-PDF cannot meet Nuvitae's ATS-readability and deterministic layout requirements, making a Playwright/HTML or another renderer preferable.
- Extraction spikes show Reactive Resume templates/editor code cannot be reused without importing most of its schema, UI, font, and build stack.
- Security review requires isolation or compliance controls that make either reference architecture operationally unsuitable.
