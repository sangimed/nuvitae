# Browser and API response policy

This page records the implemented response-policy ownership established for
issue #76. A deployment must not reproduce these headers in multiple layers:
each policy has one authoritative owner.

## Ownership

| Policy                              | Authoritative owner                  | Current behavior                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page/static CSP and browser headers | Next.js middleware                   | Applied to page, framework-static, and web error responses. `frame-ancestors 'none'` is the canonical framing control; `X-Frame-Options: DENY` supports older clients.                                                                                                                                                                                          |
| API CSP and browser headers         | Nest bootstrap middleware            | Applied before body parsing and routing, including API errors. Next's external rewrite does not reliably retain middleware response headers; Next deliberately leaves these paths to Nest. JSON gets `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, plus the same nosniff, referrer, framing and Permissions Policy as web. |
| Personal page caching               | Next.js middleware                   | All document/page responses are `Cache-Control: no-store` because any route can hydrate owner data. `/_next/static`, image optimization, and favicon paths retain Next's asset caching.                                                                                                                                                                         |
| API caching                         | Nest bootstrap middleware            | Every API success and error response is `Cache-Control: no-store`. The API contains personal resume, provider, and session routes, so a single fail-closed API policy avoids route omissions.                                                                                                                                                                   |
| OpenAPI                             | Nest bootstrap                       | Swagger UI/schema are mounted only when `NODE_ENV` is not `production`. Production returns the ordinary not-found response.                                                                                                                                                                                                                                     |
| Logout site data                    | Community auth controller            | Logout revokes the server session, precisely expires its cookie, and sends `Clear-Site-Data: "cache"`. Nuvitae has no browser storage or service worker; broader directives (including domain-wide cookie clearing) would be unjustified.                                                                                                                       |
| HSTS                                | Verified production HTTPS terminator | Nuvitae's Compose topology has no TLS terminator and intentionally emits no HSTS over Community/Local Play HTTP. A future supported HTTPS ingress must own `Strict-Transport-Security` after TLS is verified and must not duplicate an application value.                                                                                                       |

## Derived CSP

The web policy is generated per request with a cryptographic nonce. The
nonce is forwarded to Next.js so framework bootstrap scripts and generated
styles receive it; page rendering is dynamic for that reason. Both incoming CSP
header variants are removed before installing the server policy, so a client
cannot supply the competing nonce Next uses during report-only rendering. The current
application uses:

- self-hosted Next.js scripts, CSS, and `next/font` files;
- same-origin API requests by default, with only the validated configured
  `NEXT_PUBLIC_NUVITAE_API_BASE_URL` origin added to `connect-src`;
- ordinary DOM preview and browser print-to-PDF, not frames, objects, media, or
  workers;
- `data:` only for images; no executable `data:` or `blob:` source.

Accordingly, inline scripts and styles require the request nonce, objects, frames,
media, and workers are denied, framing is denied, and base/form targets remain
self. There is no wildcard, `unsafe-inline`, or `unsafe-eval` fallback.

The API policy never permits executable resources. The only exception is the
development-only Swagger HTML UI and its `/openapi/` assets: no CSP is imposed
there, while no-store and other browser protections remain. Production mounts
neither UI nor schemas and has no exception. JSON schema endpoints retain the
restrictive API CSP even in development. API policy is always enforced; the
report-only switch applies only to the Next-rendered application.

`Clear-Site-Data: "cache"` is supplemental best-effort logout cleanup on supported
secure origins. It is not proof that a browser erased its cache, and it does not
replace no-store, cookie expiry, or server revocation. HTTP Community clients
must not rely on it. Broader storage/cookie clearing remains unjustified.

## Report-only trial and enforcement verification

The same built web image supports a deliberate report-only trial through
`NUVITAE_CSP_REPORT_ONLY=true`; report-only is the default in code and Compose
while browser compatibility remains unresolved. Only explicit `false` enables
web CSP enforcement. The policy directives are unchanged, with no unsafe
sources added. API CSP and the other browser/cache headers remain enforced;
`X-Frame-Options: DENY` continues to block framing during the web CSP trial.
Run the focused built-container suite in report-only mode for rollout checks.
The explicit enforcing run is a separate compatibility gate expected to remain
red until the findings below are resolved:

```sh
NUVITAE_CSP_REPORT_ONLY=true ./scripts/local-play-up.sh
NUVITAE_CSP_REPORT_ONLY=true docker compose \
  -f compose.yml -f compose.local.yml --profile test \
  run --rm playwright-test pnpm exec playwright test \
  --config=playwright.local-play.config.ts \
  tests/e2e/local-play/response-policy.e2e.test.ts

NUVITAE_CSP_REPORT_ONLY=false docker compose \
  -f compose.yml -f compose.local.yml up -d --force-recreate web
NUVITAE_CSP_REPORT_ONLY=false docker compose \
  -f compose.yml -f compose.local.yml --profile test \
  run --rm playwright-test pnpm exec playwright test \
  --config=playwright.local-play.config.ts \
  tests/e2e/local-play/response-policy.e2e.test.ts
```

The browser test records directive names and event counts as a test attachment
after exercising public and error pages, self-hosted fonts, a personal resume
editor, and Chromium print-to-PDF. Report-only prints the observations without
claiming zero violations; explicit enforcement requires zero events and zero
CSP console violations. HTTP assertions remain mandatory in both modes and cover a
framework static asset, public health API, authenticated personal API, API
error (including malformed JSON before routing), production session/login/logout,
unauthenticated and revoked-session responses, production Swagger UI and both
JSON/YAML schema not-found responses directly at Nest and through the public
Next `/api` rewrite, no-store,
and absence of HSTS on the plaintext local boundary. Existing export fidelity
and full Local Play suites remain the regression evidence for preview/PDF and
same-origin behavior.

For a future HTTPS deployment, verify the proxy with an external HTTPS probe.
Only then configure the proxy to emit an HSTS value appropriate to the deployed
host (initially without `includeSubDomains` or `preload` unless those broader
domains are separately proven HTTPS-only), and assert that HTTP/local responses
still do not emit it.

## Regression verification on the Next.js 16 baseline

The baseline already implemented most of #76. Built-container revalidation
found that the external API rewrite dropped Next middleware headers; Nest now
owns those headers directly. Negative tests also verify that client-supplied
CSP variants cannot compete with the server rendering nonce. CSP violation
events are retained across page navigations rather than checking only the final
document. Production Swagger UI, JSON and YAML schemas return 404; personal,
provider, malformed-body, session and revoked-session responses remain no-store.

**The browser compatibility criterion is not complete.** Initial report-only and
enforcing built-container runs passed the API and production-auth policy tests,
but failed the browser zero-violation assertion. That assertion existed at the
baseline; this branch corrected stale heading copy and retained events across
navigations, exposing rather than introducing the failures. Report-only rollout
now records those findings; the explicit enforcement gate still rejects them.
The framework 404 page reports
inline-style violations (`style-src-attr` and `style-src-elem`), and the manual
resume flow reports string-evaluation violations (`script-src`). These are
application/framework compatibility findings, not an unavailable test
environment. The follow-up must remove or nonce the offending content and
disable runtime code generation where applicable, then rerun UI and actual
export/print trials. Do not add unsafe CSP fallbacks or suppress these reports.

This evidence qualifies the earlier V3.4.1–V3.4.6 "satisfied" entry in
`verification-baseline.md`: web CSP is report-only pending compatibility;
other headers and API CSP are enforced. Deployment HSTS and proxy-generated failure responses additionally
require verification at a real supported TLS ingress. Neither the existing
plaintext Compose stack nor an Orb portal proves that deployment criterion.
