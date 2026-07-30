# Codex Subscription Spike: Evaluation Results

Date: 2026-07-30

Scope: T144 only. This artifact records measured and unverified metrics for the bounded Codex subscription spike using only anonymous synthetic fixture plans.

## Decision

No-go on quality and latency acceptance because authenticated provider evaluation could not be run under the official-support and no-real-resume constraints. Metrics that could not be reliably measured are recorded as unverified.

## Fixture Coverage

Existing manifest coverage:

| Required coverage | Status |
| --- | --- |
| French resume | Covered by manifest |
| English resume | Covered by manifest |
| Bilingual resume | Covered by manifest |
| PDF | Covered by manifest |
| DOCX | Covered by manifest |
| Partial/failure cases | Covered by manifest |

Known gap:

- Dedicated realistic anonymous fixture binaries and expected semantic JSON for French, English, bilingual, single-column, multi-column, PDF, and DOCX parser evaluation are planned by later tasks T169-T170. This spike did not create those production fixture artifacts.

## Measurements

| Metric | Result | Evidence |
| --- | --- | --- |
| Invocation success rate | 0/1 in this environment | Provider network unavailable |
| Schema-valid response rate | Unverified | No provider final response |
| Field precision | Unverified | No semantic parser output |
| Field recall | Unverified | No semantic parser output |
| Work-experience grouping accuracy | Unverified | No semantic parser output |
| Valid-evidence rate | Unverified | No semantic parser output |
| Invented-field rate | Unverified | No semantic parser output |
| Latency | Failed before completion | DNS/network failure after retries |
| Timeout behavior | Unverified | No controlled long-running provider call |
| Malformed-output behavior | Unverified | No provider final response |
| Authentication error behavior | Verified missing auth reports `Not logged in` | Empty isolated `CODEX_HOME` |
| Provider unavailability | Verified network failure emits JSONL error and `turn.failed` | Sandbox DNS/network blocked |
| Quota/subscription exhaustion | Unverified | Not safely reproducible without real account limits |

## Experimentally Observed Behavior

The only provider invocation attempted used a temporary empty workspace, temporary empty `CODEX_HOME`, no real resume data, read-only Codex sandbox, JSONL output, temporary JSON Schema, and final-message output file.

Result:

```text
turn.failed
stream disconnected before completion: error sending request for url (https://api.openai.com/v1/responses)
```

## Inference

The available evidence validates failure handling and local CLI compatibility, not extraction quality. Any precision, recall, evidence, invention, or latency number would be invented and is therefore recorded as unverified.

## Unresolved Questions

- Whether Codex can meet a 150-second provider invocation budget on 5-page resumes.
- Whether extracted text with source locations is enough for multi-column work grouping.
- Whether schema-valid response rate remains high across French, English, and bilingual fixtures.
- Whether quota and rate-limit failures are machine-distinguishable.

## Blockers

- Authentication no-go from T139.
- Network access unavailable in this agent environment.
- Realistic semantic-parser fixture binaries and expected outputs are outside T139-T145 and belong to later tasks.

## Security Concerns

- Quality tests must use synthetic anonymous resumes only.
- Evaluation artifacts must store metrics and redacted failure categories, not raw resumes, source snippets, prompts, provider JSONL streams, credentials, or session material.

## Product Implications

The production acceptance threshold cannot be considered met. Later production implementation requires a fresh evaluation run after an official provider connection exists.
