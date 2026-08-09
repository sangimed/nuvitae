# T201-C02 Campaign B engineering decision

Status at decision: prospective; no B01 evidence existed.

Campaign A (`T201-C02`, attempts 1–6) is immutable and closed. Its final
attempt correctly records `further_attempts_permitted: false`, no broker start,
no credential mount, no backend contact, and the policy failure
`live_runner_rebuild_after_exact_preflight`. No historical attempt content or
historical `further_attempts_permitted` value is changed by this decision.

Those attempts do not disprove Codex semantic viability. C01 already proved one
successful direct semantic invocation. Campaign A instead exposed runner and
result-topology defects, including an image rebuild after the credential-free
exact-live preflight. The product decision remains that Nuvitae Community
retains direct ChatGPT/Codex subscription integration as a strategic objective.
OpenClaw and Hermes remain compatibility references; official Codex behavior is
the primary reference.

Campaign B (`T201-C02-B`) is authorized solely because the runner architecture
materially changed to build once, resolve a local immutable image ID, pass that
ID explicitly to preflight and runtime, and prohibit any build, pull, retag, or
implicit Compose build after preflight. The credential-free exact topology must
pass before preserved credential volumes are checked for existence. B01
(`T201-C02-B01`) has its own bounded stop and sanitized evidence path; it is not
created, authorized, or executed by this decision.

At the time of this decision, T201 remained incomplete and C02 remained
semantically unevaluated pending a separately authorized B01. C03-C06,
T202-T203, and T164-T165 were then unexecuted or incomplete as recorded in the
canonical task plan.

Later status is maintained by the canonical T201 matrix at
`docs/research/codex-direct-semantic-parsing.md`: C02 subsequently passed
canonical live validation, while C03 B01 and B02 were later executed and failed.
Those C03 outcomes remain immutable historical evidence; C03 is pending fresh
canonical live validation, C04-C06 remain unexecuted, and T202, T203, T164, and
T165 remain blocked.
