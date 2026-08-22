# Deterministic resume-import corpus

This directory is the network-free binary corpus owned by
`@nuvitae/test-fixtures`. Every PDF/DOCX and adjacent `*.oracle.json` file is
derived from the declarative specs in
`src/resume-import/generator/fixture-spec.ts`. The manifest remains the fixture
taxonomy and source of expected eligibility, warnings, failures, and
provenance requirements.

All people, organizations, achievements, addresses, and contact details are
fictional. Contact data uses reserved `example.test` domains. Never derive a
fixture from a user upload or production record.

## Generate and verify

Run in the repository's pinned Docker development/test environment:

```bash
pnpm fixtures:resume-import
pnpm --filter @nuvitae/test-fixtures verify:resume-import
```

Generation uses pinned PDFKit and yazl versions, fixed PDF metadata dates,
fixed ZIP entry timestamps, explicit seeds, and a fixed renderer version.
Verification renders every fixture twice in memory and compares both results
with the committed binary and `checksums.json`. Neither command downloads data.

Generate a local, uncommitted stress corpus with a reproducible fixed seed:

```bash
pnpm fixtures:resume-import --mode stress --seed 1337 --count 200
```

Each generated case logs `fixtureId`, `seed`, format, layout, profile, renderer
version, and SHA-256. Stress output is ignored by Git. External benchmarks are
not implemented: any future adapter must remain opt-in, verify license and
provenance, record source/version/checksum, and never run during normal tests.

## Add a fixture

1. Add an entry to `manifest.ts`; do not create a parallel taxonomy.
2. Add its profile/layout/mutation mapping to `fixture-spec.ts`. A valid case
   must have complete machine-readable semantic truth. Invalid cases must set
   an existing explicit failure category.
3. Add reusable fictional content in `content-factory.ts` when the existing
   profiles do not express the semantic case.
4. Extend `renderers/pdf.ts` or `renderers/docx.ts` for valid layout behavior.
   Keep destructive post-processing in `mutations.ts` rather than teaching a
   normal renderer to emit malformed files.
5. Regenerate, inspect the sidecar oracle, run the extraction integration test,
   and run the determinism verifier before committing.

Keep future language profiles behind the existing language field so separate
multilingual work can add first-class profiles without changing this corpus's
domain model.
