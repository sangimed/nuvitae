# Application locale preference

Issue #31 adds a non-sensitive browser preference, `nuvitae-app-locale`.
The cookie contains only an allowlisted locale ID. It is host-only, has a
one-year maximum age, `Path=/`, `SameSite=Lax`, and `Secure` when set over HTTPS.
It is intentionally client-readable/writable so language switching does not
require navigation or an API write. It is not an authentication or authorization
input. Server locale resolution treats cookies and language headers as untrusted
and falls back to a supported locale.

No resume content, identity, source language, provider state, credentials, or
document identifiers enter the preference. No new network destination,
dependency, storage service, telemetry field, or API payload is introduced.
Locale changes never invoke resume mutations or translate document content.
Catalog strings use React's escaped text sinks; no HTML evaluation is allowed.
Never display raw provider errors as a localization fallback.

The root layout remains dynamic with its existing CSP nonce behavior. This
change does not alter middleware, authentication, owner scoping, retention,
private document storage, or provider access. English-only screens are explicitly
marked English/LTR until migrated; resume rendering retains content-derived
direction independent of the application preference.
