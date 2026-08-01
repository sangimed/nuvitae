# T201-C02 Campaign B engineering decision

Status: prospective; no B01 evidence exists.

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

T201 remains incomplete and C02 remains semantically unevaluated pending a
separately authorized B01. C03–C06, T202–T203, and T164–T165 remain unexecuted
or incomplete as recorded in the canonical task plan.
