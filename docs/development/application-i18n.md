# Application localization (issue #31, first slice)

## Implemented boundary

The shell navigation, language selector, home onboarding, resume-import entry
and upload policy/disclosure, and page description use one typed translation
mechanism in `apps/web/src/i18n`. All keys in this slice have English, French,
Spanish, Arabic, and Simplified Chinese resources.
The stable import-status live-region states are also localized at their display
boundary. Backend-provided status and error prose remains provider-neutral,
untranslated public text; it is never treated as a translation key.
The processing screen also localizes its status headings, rotating loading copy,
long-wait notice, draft-summary labels, review links, and replacement/manual
actions. Draft field and warning counts use `Intl.NumberFormat` with the active
application locale. The screen sets its own `lang` and direction so it can render
correctly inside an otherwise English import journey. Backend status, connectivity,
and error prose retain explicit English/LTR metadata, including the error list
under its translated heading. The provider recovery panel remains English/LTR.
This is **not completion of issue #31** or a claim of complete application
translations. Translations still need native-speaker product review.

No dependency was added. The current copy is static, so a typed dictionary and
React context provide the needed capability without a second routing system,
runtime message parser, or translation service. Reconsider a maintained ICU
implementation when actual pluralized/interpolated messages need it; do not
introduce ad-hoc string replacement or concatenate translated sentences.

## Locale resolution and rendering decision

Use an application preference without locale-prefixed routes. Private resume
URLs identify a document, not its viewer's language; sharing them must not
overwrite the recipient's preference. This avoids duplicated private routes
and changes to authentication, API routing, or middleware. Future public,
indexable marketing pages can make their own explicit routing decision.

Priority: valid `nuvitae-app-locale` cookie, supported `Accept-Language` entries
in descending quality order, then English. Canonical IDs are `en`, `fr`, `es`,
`ar`, and `zh-CN`. Regional English/French/Spanish/Arabic tags use their base
language. `zh`, `zh-CN`, `zh-SG`, and `zh-Hans` select simplified Chinese;
traditional Chinese is not silently treated as simplified Chinese.

The dynamic root layout resolves the locale on the server and supplies exactly
that value to the client provider, `html[lang]`, `html[dir]`, and metadata.
The selector updates client context and document metadata without reloading,
refreshing the router, keying/remounting the editor, or calling an API. Its
host-only, one-year cookie uses `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS.
If browser policy blocks persistence, the in-memory selection lasts only for
the current mounted application. This is a browser preference, not an account
setting; it does not synchronize across devices or open tabs.

Migrated interactive copy must consume `useTranslation()` so an in-place
switch updates it. Use `getAppLocale()` and `translate()` for request-time
metadata. Do not pass pretranslated server strings into long-lived client
screens that must respond to language switching.

## Copy and contributor workflow

- Add semantic `area.purpose` keys to the English catalog in `messages.ts`.
  Do not use literal English sentences as keys. Add the same key to every
  `Messages` catalog; TypeScript rejects missing keys.
- Render with `t("area.purpose")`. React escapes the returned string. Catalogs
  are plain text, never HTML, URLs, executable expressions, or API messages.
- New hard-coded product copy is an explicit exception. Product names and
  the Local Play development warning remain intentional exceptions here.
- To add a locale, add a complete catalog and native-language selector name,
  register its canonical ID, define direction/negotiation, and test it. No
  duplicate screens are needed.
- Tests compare exact key sets and reject empty copy. Development/test throws
  on missing keys; production falls back to English, then the key as a last
  resort. Typechecked callers cannot normally request an unknown key.
- No interpolation or pluralization is implemented in this static-copy slice.
  Future support must use named, reorderable variables and locale-specific
  plural rules, with tests for missing/extra variables and escaping. Translators
  must not be asked to preserve English word order.
- For application values, use `Intl.DateTimeFormat`, `Intl.NumberFormat`, and
  `Intl.RelativeTimeFormat` with the active locale. Formatting migration remains
  follow-up work; never format source evidence or resume-authored dates through
  the application locale.

Run through Docker Compose:

```sh
docker compose run --rm workspace pnpm exec vitest run apps/web/src/i18n apps/web/src/components/AppShell.test.tsx
docker compose run --rm workspace pnpm --filter @nuvitae/web typecheck
docker compose run --rm workspace pnpm lint
docker compose run --rm workspace pnpm format:check
```

The focused browser regression is
`tests/accessibility/application-locale.a11y.test.ts`. It uses `localhost`
for the dev-server origin: numeric loopback produced failed Next.js HMR
WebSocket handshakes in the orb, leaving both the selector and manual editor
unhydrated. Report-only CSP messages were not the blocker. Changing only the
test origin made both failures pass; no CSP bypass or policy change is needed.

With the Compose workspace dev server already running on port 3000, the orb
can run the test container on the host network (as root only for the existing
root-owned artifact directory):

```sh
docker compose -f compose.yml -f - run --rm --user 0 playwright-test \
  pnpm exec playwright test tests/accessibility/application-locale.a11y.test.ts \
  --output=.local-play/artifacts/i18n-results <<'YAML'
services:
  playwright-test:
    network_mode: host
YAML
```

The tests verify French cookie persistence and server/client metadata after
reload, Arabic SSR and narrow layout, and real manual-editor unsaved text
through Arabic/French switches. The manual API is stubbed: requests must remain
unchanged during switching, and an explicit save must carry exactly the
original synthetic document plus the user's edit. This checks the browser/API
boundary, not database persistence or the complete import journey.

## Direction and resume independence

Arabic mirrors the shell and onboarding through inherited CSS grid/flex
direction, not a separate component tree. The skip link uses logical positioning.
The native selector has a translated label, native language names, per-option
language metadata, focus support, and a localized polite status announcement.

Unmigrated content is explicitly `lang="en" dir="ltr"`; onboarding overrides
that boundary with its active locale. Remove the English boundary per screen
as its full copy and layout migrate. Do not mark English prose as Arabic.
The existing `ProfessionalResume` renderer retains `dir="auto"`; its model,
section titles, dates, and content do not read the application locale. No
locale is added to resume API payloads, provider requests, or persistence.

## Audit and follow-up acceptance criteria

| Area / current owner                                                           | Status and next bounded work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`, `HomeOnboarding`, root metadata                                    | Localized in this slice; native-speaker review outstanding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `CreateResumeEntry`, `UploadStep`, `ProviderDisclosure`                        | Localized entry, file guidance, local validation, accessible file control, actions, and provider disclosure; the connection-status card and server-safe errors remain separate follow-up work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ImportFlow`, `ImportStatusLiveRegion`                                         | Stable normalized live-region states and finite current processing-step labels are localized; dynamic percentage/progress phrasing remains follow-up work while preserving safe public messages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ProcessingStep`, `ProviderRecoveryActions`, `ErrorSummary`                    | Processing-screen static copy, summary counts, review/replacement/manual actions, and error-summary heading are localized. Backend safe prose and provider recovery remain English with explicit language/direction metadata; localizing stable error IDs is follow-up work                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ReviewStep`, `ReviewWarning`, `FieldProvenance`, `ConfirmationStep`           | The review intro/loading states, warning labels/actions/statuses/category messages, provenance labels, and confirmation/discard outcomes and safe errors are localized in all five catalogs. Review API message strings and resume/source values are not translated or mutated; warning UI uses stable warning types, and confirmation/discard UI uses stable outcome categories with localized generic fallbacks. French/Arabic tests cover language switching, safe category mapping, ignoring server prose, RTL metadata, dialog naming, Escape dismissal, focus restoration, and representative content preservation; the wider review editor, correction/focus-advance path, and rendered-resume persistence still need coverage. |
| `DeleteSourceControl`                                                          | Section and confirmation copy plus the safe failure message are localized in all five catalogs. French and Arabic/RTL tests cover dialog naming, description, Escape dismissal, focus restoration, and unchanged resume ID/success callback. Response success text remains unchanged; other review/confirmation flows remain follow-up work.                                                                                                                                                                                                                                                                                                                                                                                           |
| `ManualResumeFlow`, `StructuredResumeSections`, `ResponsiveVisualResumeEditor` | English field/section labels, validation, save states and editor controls remain; unsaved edits and explicit save payload preservation now have focused browser coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ResumeWorkspace`, `ResumeExportView`, `ConfirmedResumeView`                   | `ResumeExportView` has typed English, French, Spanish, Arabic and Simplified Chinese resources for its loading, controls, status and safe error states. It maps export failures to local safe copy rather than rendering server prose, while `ProfessionalResume` retains `dir="auto"` and never reads application locale; workspace and confirmed-editor copy/formatting remain follow-up work.                                                                                                                                                                                                                                                                                                                                       |
| `CommunityOwnerAccess`, `CodexConnectionScreen`, contextual AI controls        | English authentication/provider disclosure, connection and recovery; preserve provider neutrality and credential isolation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `components/community`, `AccessibleDialog`                                     | Default accessible labels and status prose need caller-localized values or shared keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `services/import-resume/*`, manual/resume workspace clients                    | Many clients already decode discriminated status/error codes, but English safe messages are assembled locally; map codes to keys at the display boundary rather than localizing backend/provider prose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `review-date.ts`, editor dates, workspace/export quantities                    | Inventory each value before formatting; source/document values are not UI quantities                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Still deferred: the entire critical import→review→edit→export journey in each
locale; complete application translations for all five languages; full dialog,
menu, form and directional-icon RTL audit; locale-aware application quantities;
localized errors/statuses across API consumers; comprehensive screen-reader and
mixed-direction actual resume-flow checks. Keep #31 open. Migrate one screen
with its error/accessibility states at a time, then add representative French
and Arabic flow coverage rather than multiplying the whole E2E suite.

Processing regressions in `ProcessingStep.test.tsx` cover French and Arabic
headings, in-place switching without moving focus, locale-formatted summary
counts, unchanged review navigation and recovery callbacks, English backend
error metadata, loading timers across polls, and server/client hydration.
These component checks do not establish native-speaker translation quality or
complete browser/screen-reader coverage of the import flow.
