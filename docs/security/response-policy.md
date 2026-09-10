# Browser and API response policy

This page records the implemented response-policy ownership established for
issue #76. A deployment must not reproduce these headers in multiple layers:
each policy has one authoritative owner.

## Ownership

| Policy                                                                                  | Authoritative owner                                         | Current behavior                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, Permissions Policy | Next.js middleware, the browser-facing application boundary | Applied to page, framework-static, error, and rewritten API responses. `frame-ancestors 'none'` is the canonical framing control; `X-Frame-Options: DENY` supports older clients.                                                                         |
| Personal page caching                                                                   | Next.js middleware                                          | All document/page responses are `Cache-Control: no-store` because any route can hydrate owner data. `/_next/static`, image optimization, and favicon paths retain Next's asset caching.                                                                   |
| API caching                                                                             | Nest bootstrap middleware                                   | Every API success and error response is `Cache-Control: no-store`. The API contains personal resume, provider, and session routes, so a single fail-closed API policy avoids route omissions.                                                             |
| OpenAPI                                                                                 | Nest bootstrap                                              | Swagger UI/schema are mounted only when `NODE_ENV` is not `production`. Production returns the ordinary not-found response.                                                                                                                               |
| Logout site data                                                                        | Community auth controller                                   | Logout revokes the server session, precisely expires its cookie, and sends `Clear-Site-Data: "cache"`. Nuvitae has no browser storage or service worker; broader directives (including domain-wide cookie clearing) would be unjustified.                 |
| HSTS                                                                                    | Verified production HTTPS terminator                        | Nuvitae's Compose topology has no TLS terminator and intentionally emits no HSTS over Community/Local Play HTTP. A future supported HTTPS ingress must own `Strict-Transport-Security` after TLS is verified and must not duplicate an application value. |

## Derived CSP

The enforced policy is generated per request with a cryptographic nonce. The
nonce is forwarded to Next.js so framework bootstrap scripts and generated
styles receive it; page rendering is dynamic for that reason. The current
application uses:

- self-hosted Next.js scripts, CSS, and `next/font` files;
- same-origin API requests by default, with only the validated configured
  `NEXT_PUBLIC_NUVITAE_API_BASE_URL` origin added to `connect-src`;
- ordinary DOM preview and browser print-to-PDF, not frames, objects, media, or
  workers;
- `data:` only for images; no executable `data:` or `blob:` source.

Accordingly, scripts and styles require the request nonce, objects, frames,
media, and workers are denied, framing is denied, and base/form targets remain
self. There is no wildcard, `unsafe-inline`, or `unsafe-eval` fallback.

## Report-only trial and enforcement verification

The same built web image supports a deliberate report-only trial through
`NUVITAE_CSP_REPORT_ONLY=true`; enforcement is the default. Run the focused
built-container suite once in each mode:

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

The browser test fails on a CSP violation and prints the mode plus a zero-report
summary only after exercising public and error pages, self-hosted fonts, a
personal resume editor, and Chromium print-to-PDF. HTTP assertions cover a
framework static asset, public health API, authenticated personal API, API
error, production session/login/logout, production OpenAPI not-found, no-store,
and absence of HSTS on the plaintext local boundary. Existing export fidelity
and full Local Play suites remain the regression evidence for preview/PDF and
same-origin behavior.

For a future HTTPS deployment, verify the proxy with an external HTTPS probe.
Only then configure the proxy to emit an HSTS value appropriate to the deployed
host (initially without `includeSubDomains` or `preload` unless those broader
domains are separately proven HTTPS-only), and assert that HTTP/local responses
still do not emit it.
