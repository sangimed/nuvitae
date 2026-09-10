# Issue #23 temporal-semantics audit

**Date:** 6 September 2026
**Scope:** API, shared contracts, domain, TypeORM, worker jobs, import lifecycle,
retention/deletion, provider sessions, and web parsing/display.

## Decision

Nuvitae has two intentionally separate temporal domains:

1. **Source resume dates** are precision-preserving calendar data. A year,
   month/year, or `present` value is represented by `ResumeDate` / `resumeDateSchema`;
   it is never converted to a timestamp.
2. **Operational instants** are absolute moments. They are stored as PostgreSQL
   `timestamptz`, handled in application code as `Date`, and cross API and durable-job
   boundaries as canonical ISO-8601 UTC strings ending in `Z`.

Trusted provider session input may use an explicit numeric offset. It is decoded as
an offset-aware instant and normalized to `Date`; an offset-free timestamp is rejected.

Durations are quantities, not timestamps: retention is seven elapsed 24-hour days,
foreground timeouts are configured seconds, session TTLs are seconds, and rate-limit
windows are elapsed milliseconds. They are calculated from epoch milliseconds, so DST
does not add or remove an hour.

## Inventory

| Classification | Fields and boundary                                                                                                                                                                                                                                                          | Result                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Partial date   | Work/education/certification `startDate`, `endDate`, `issuedAt`, `expiresAt`; extracted `date` and `date_range`                                                                                                                                                              | `ResumeDate` carries `year`, optional `month`, or `present`; JSONB persistence and UTC display helper preserve precision. |
| Date-only      | None currently modelled independently                                                                                                                                                                                                                                        | No fabricated day/time values found.                                                                                      |
| Duration       | Import retention (7 × 24 h), foreground timeout, pending OAuth/session TTL, rate-limit windows, parser/provider timeout limits                                                                                                                                               | Epoch-millisecond arithmetic; values do not cross a timestamp schema.                                                     |
| Instant        | API response/request revisions, imported document/draft/artifact lifecycle, confirmation/review timestamps, source deletion jobs, worker payload times/deadlines, provider connection/session expiry, Community auth sessions, semantic parse/evidence records, audit timing | `Date` internally; `timestamptz` in PostgreSQL; canonical UTC `Z` at HTTP/BullMQ contracts.                               |

## Boundary findings

- **Persistence:** all inspected operational columns use `timestamptz` / `TIMESTAMP WITH
TIME ZONE`; no semantically incorrect `timestamp without time zone` column was found.
  No migration is required.
- **API and durable jobs:** the prior generic `z.string().datetime()` declarations did
  not state the repository's canonical `Z` rule. Shared `utcInstantSchema` now makes
  it explicit for REST contracts, optimistic-concurrency timestamps, and worker payloads.
- **Worker/import lifecycle:** producers use `Date#toISOString()`; workers validate the
  canonical timestamp before scheduling deadlines, and retention/deletion compare epoch
  milliseconds.
- **Provider/session expiry:** persisted connection/session expiry is `timestamptz`.
  The encrypted Codex session parser now rejects an offset-free expiry rather than
  allowing host-local parsing; explicit provider offsets remain supported.
- **Web:** web clients validate canonical instants before parsing. Display uses
  `Intl.DateTimeFormat` for the viewer's locale only after decoding a `Z` instant.
  Resume partial dates retain their existing UTC-only presentation helper and never pass
  through `new Date("YYYY")` or `new Date("YYYY-MM")`.

## Regression coverage

The contract suite now rejects offset-free operational timestamps and proves an explicit
offset near the Europe/Paris DST fall-back normalizes to the expected UTC instant.
Existing retention, session expiry, worker deadline, and TypeORM mapping tests exercise
the resulting `Date`/`timestamptz` flow.
