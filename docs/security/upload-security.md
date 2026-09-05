# Upload security boundary

**Decision date:** 5 September 2026

**Scope:** current Community resume import and hosted-release requirements

Uploaded bytes, extracted text, filenames, package metadata, links, queue data,
and provider output remain untrusted throughout their lifetime. Passing one
check never makes the same value safe for a later SQL, HTML, process, log,
provider, or export sink.

## Upload-path inventory

| Entry point | Accepted input and limits | Storage, processing, consumers | Retention and controls |
| --- | --- | --- | --- |
| Authenticated `POST /import-resume` | Exactly one multipart `file`; PDF or DOCX; 10 MiB; extension, declared MIME, and binary signature must agree | Generated owner/import-scoped object key in the private volume; validation jobs read through the private-storage adapter; PDF.js handles PDF structure/text; bounded OOXML parsing and LibreOffice rendered-page counting handle DOCX; normalized fragments feed the provider-neutral semantic contract; confirmed data feeds owner-scoped persistence, React preview, and browser print-to-PDF | Source and source-reconstructing artifacts are deleted on explicit deletion/discard or the seven-day deadline by owner-scoped idempotent jobs. There is no public source-file route. Validation is fail closed before semantic/provider work. |
| Avatar/photo upload | Not implemented | No endpoint, storage path, parser, consumer, or lifecycle exists | A future image path is a new trust boundary and requires image decode/resource, metadata, moderation, storage, and export review before implementation. |
| Template/asset import | Not implemented | No endpoint or consumer exists | Must not reuse resume-document acceptance implicitly. |
| Admin/internal upload | Not implemented | No endpoint or consumer exists | “Internal” would not make bytes trusted; the same boundary rules apply. |

The browser file picker is usability-only. Server checks are authoritative.
Original filenames are retained only as bounded display metadata; they never
select a path, subprocess argument, log field, or object key.

## Enforced limits and failure behavior

| Resource | Community ceiling |
| --- | --- |
| Multipart/source bytes | 10 MiB |
| Rendered pages | 5 |
| PDF indirect objects | 50,000 |
| PDF structural syntax tokens | 1,000,000 |
| PDF extracted text items | 20,000 |
| DOCX ZIP members | 200 |
| One DOCX member, uncompressed | 5 MiB |
| Total DOCX uncompressed bytes | 20 MiB |
| DOCX member compression ratio | 200:1 |
| DOCX XML depth | 80 |
| DOCX paragraphs | 10,000 |
| DOCX text runs | 20,000 |
| Extracted text | 120,000 UTF-16 code units |
| Semantic source fragments | 800 |
| Semantic request/response JSON | 256,000 bytes each |
| LibreOffice address space | 512 MiB (`RLIMIT_AS`) |
| LibreOffice CPU and wall time | 180 seconds each |
| Parser stdout/stderr | 64 KiB each |
| Parser temporary filesystem | 768 MiB Compose tmpfs |

PDF/DOCX signature mismatch fails before private persistence with the public,
privacy-safe `file_type_mismatch` reason. Malformed containers, active content,
expansion/text/object limits, parser cancellation/timeouts, and unsupported
features map to bounded categories; diagnostics never include signatures,
filenames, URLs, text, parser output, or exception details.

DOCX processing streams only bounded ZIP members, rejects traversal,
encryption, duplicate security-sensitive parts, macros, DTD/entities, excessive
XML depth, and external non-hyperlink relationships. External hyperlink labels
remain inert source data; package relationships are not fetched. PDF.js uses
in-memory bytes with auto/range/stream/worker fetch, eval, system fonts, and
font-face loading disabled. PDF URI annotations may become inert text but are
never fetched. The semantic provider receives no tools and cannot initiate
application network access based on resume text.

## Parser isolation decision

Community runs as a loopback-only, single-owner Compose installation. The
worker and one-shot parser test run non-root with all Linux capabilities
dropped, `no-new-privileges`, a private `noexec,nosuid,nodev` parser tmpfs, no
Docker socket or host mounts, generated mode-0600 temporary input, fixed
absolute executables, argument arrays with `shell:false`, an allowlisted clean
environment, process-group termination, CPU/address-space/wall/output bounds,
and cleanup on every outcome. The test parser has no network.

The production worker still needs database, queue, private-source, provider
credential, and provider-network access. PDF.js and OOXML text parsing execute
inside that worker process; LibreOffice is a bounded child process but shares
the worker container/network namespace. Splitting parsing into a separate
networkless service would add deployment, protocol, storage-transfer, and
availability complexity disproportionate to the current loopback Community
boundary, so it is not added solely for checklist completion.

This is **not** sufficient evidence for public hosted uploads. Before hosted
release, isolate all deterministic parsing in a dedicated no-network runtime
with no database, queue, provider credentials, broad private-storage mount, or
application secrets, and enforce cgroup memory/PID/CPU/temp-storage bounds in
addition to the in-process limits. Treat this as a hosted release gate, not a
claim that parser vulnerabilities are impossible in Community.

## Malware, CDR, and moderation decisions

- **Community malware scanning:** no bundled antivirus. Shipping ClamAV would
  materially increase image size, memory, update operations, stale-signature
  failure modes, and installation complexity. Structural validation, strict
  format support, private storage, non-execution, and bounded parsing remain
  mandatory; antivirus would not replace them.
- **Hosted malware scanning:** decide before public hosted uploads, based on
  exposure and incident operations. Prefer a local maintained scanner in the
  isolated ingestion boundary. Fail closed if scanning is required but
  unavailable; monitor signature age/update failure separately from a malware
  positive. Never send private CVs to a third-party analysis service without a
  separate privacy/security review. Use only safe standard test signatures;
  never commit malware.
- **CDR:** reject unsupported active/macro/embedded/external-fetch structures
  rather than silently rewriting source files. Nuvitae extracts the bounded
  textual/structural subset it needs while preserving the immutable original
  and source provenance. Rebuilding PDF/DOCX is deferred because fidelity loss
  would weaken grounding and does not remove the need for parser isolation.
- **Moderation:** no NSFW/abuse scanner for private text-only CV import. There
  is no current public-sharing or image-upload abuse requirement, and an opaque
  external classifier would add privacy risk and false positives. Revisit for
  public resumes, images, or generated public content with explicit blocked vs
  warned categories and privacy-safe operations.

## Untrusted text and downstream sinks

Instruction-like, HTML/JavaScript-looking, SQL-looking, shell-looking, path-like,
and control-looking visible text is resume data. It is not rejected by keyword.
Structural package controls are distinct from visible wording.

- AI instructions and the serialized `document` data are separate. Fixed
  instructions say the document may contain hostile instructions; providers
  receive no tools, storage paths, environment, or credentials. Request/output
  size and schemas, canonicalization, grounding, no-invention checks, review,
  and explicit confirmation remain authoritative.
- TypeORM operations and explicit SQL use bound parameters and owner-qualified
  predicates. No SQL keyword filtering is used.
- React renders resume values as text. No production untrusted
  `dangerouslySetInnerHTML` sink exists; links become anchors only for explicit
  HTTP(S) schemes. Preview and browser print-to-PDF share that renderer.
- The only document subprocess uses a fixed executable and fixed argument
  array with no shell. Content and original filenames are never arguments.
- Closed structured-event schemas accept only bounded reason codes and
  operational metadata. Resume text, arbitrary filename, URLs, prompt/response,
  stdout/stderr, and raw errors are excluded.

The deterministic #37 corpus remains the canonical fixture architecture. It
contains valid PDF/DOCX, malformed/corrupt/oversized/page-limit cases, and a
valid instruction-like DOCX whose text must remain data. Focused parser/security
tests use deterministic in-memory builders for decompression bombs, active PDF
actions, external relationships, path traversal, and resource ceilings, plus
privacy-safe logs, safe rendering, and provider-boundary prompt injection.
