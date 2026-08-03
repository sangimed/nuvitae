/**
 * Explicit testing-only import boundary for the deterministic semantic
 * provider test adapter.
 *
 * This module is intentionally NOT part of the production
 * `@nuvitae/import-application` barrel. It is reachable only through the
 * dedicated `@nuvitae/import-application/testing` subpath, which local/E2E
 * worker compositions may use for explicit dependency injection. Production
 * compositions must never import this path.
 */
export {
  DeterministicSemanticParserProvider,
  createDeterministicSemanticParserProvider,
  deterministicSemanticProviderKind,
} from "./deterministic-semantic-parser-provider.js";
export {
  deterministicFixtureProfiles,
  buildFixtureParseRequest,
  type DeterministicFixtureProfile,
  type DeterministicFixtureProfileId,
} from "./fixture-transcripts.js";
