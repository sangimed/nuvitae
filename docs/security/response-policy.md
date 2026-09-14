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
`NUVITAE_CSP_REPORT_ONLY=true`; production and Compose now enforce by default.
Explicit `false` also enables enforcement. `next dev` defaults to report-only
because its development HMR uses evaluation; this is not the supported built
production runtime and adds no unsafe source to the policy.
The policy directives are unchanged, with no unsafe sources added.
API CSP and the other browser/cache headers remain enforced;
`X-Frame-Options: DENY` continues to block framing during the web CSP trial.
Run both modes after framework, validation-library, or rendering changes.
The built-container browser gate requires zero events and zero CSP console
violations in **both** modes, including export navigation and PDF extraction:

```sh
. ./scripts/local-play-env.sh
NUVITAE_CSP_REPORT_ONLY=true ./scripts/local-play-up.sh
docker compose -f compose.yml -f compose.local.yml build web-production-policy
NUVITAE_CSP_REPORT_ONLY=true docker compose \
  -f compose.yml -f compose.local.yml up -d --wait web web-production-policy
NUVITAE_CSP_REPORT_ONLY=true docker compose \
  -f compose.yml -f compose.local.yml --profile test \
  run --rm playwright-test pnpm exec playwright test \
  --config=playwright.local-play.config.ts \
  tests/e2e/local-play/response-policy.e2e.test.ts \
  tests/browser/resume-export/ats-pdf-export.spec.ts

NUVITAE_CSP_REPORT_ONLY=false docker compose \
  -f compose.yml -f compose.local.yml up -d --wait web web-production-policy
NUVITAE_CSP_REPORT_ONLY=false docker compose \
  -f compose.yml -f compose.local.yml --profile test \
  run --rm playwright-test pnpm exec playwright test \
  --config=playwright.local-play.config.ts \
  tests/e2e/local-play/response-policy.e2e.test.ts \
  tests/browser/resume-export/ats-pdf-export.spec.ts
```

The shared built-browser fixture retains violation events across navigations
and attaches directive/disposition, static chunk path, line/column, and an
inline/eval/resource category. It never retains personal URLs, script samples,
or raw console messages. Tests exercise public and error pages, self-hosted
fonts, manual create/edit/save/reload, soft navigation, saved preview, export,
and Chromium print-to-PDF with extracted text/order checks. The default dev
browser configuration is not a built CSP trial; Compose explicitly supplies
`EXPECT_CSP_REPORT_ONLY`, which the policy suite requires.
HTTP assertions remain mandatory in both modes and cover a
framework static asset, public health API, authenticated personal API, API
error (including malformed JSON before routing), production session/login/logout,
unauthenticated and revoked-session responses, production Swagger UI and both
JSON/YAML schema not-found responses directly at Nest and through the public
Next `/api` rewrite, no-store,
and absence of HSTS on the plaintext local boundary. Existing export fidelity
and full Local Play suites remain the regression evidence for preview/PDF and
same-origin behavior.

The test-only `web-production-policy` image builds the existing web application
with its rewrite aimed at `api-local-mode-off`; it publishes no host port.
The ordinary Local Play API deliberately enables development Swagger, so it
cannot prove production suppression. No application API behavior changes for
this fixture. Font checks exclude Next's optional locally named `Fallback`
faces (Arial may be absent in Linux), while downloaded fonts must load without
errors; a missing OS fallback is not a CSP resource violation.

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

PR #108 deliberately retained report-only after exposing browser failures.
The focused follow-up reproduced them on Next 16.3.4 / Zod 4.5.4 before changing
application code. On the built image, visit `/`, then an unknown URL, then
`/resumes/new/manual` and print. The baseline emitted exactly ten events:

| Stage                                                     | Observed events                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Unmodified application                                    | Four `style-src-attr`, one `style-src-elem`, five `script-src`            |
| Custom stylesheet-backed 404 only                         | Five `script-src`; zero style events                                      |
| Early client Zod interpreter configuration as well        | Zero events                                                               |
| Expanded report-only and enforced policy + ATS/PDF suites | Five tests pass in each mode; zero events and zero CSP console violations |

The 404 HTML contained four literal `style` attributes and an unnonced `<style>`
block from Next's default fallback. The application now owns `app/not-found.tsx`
and an ordinary CSS module: a nonce cannot authorize style attributes.
The initial manual chunk `07er4pepwjqcm.js` reported `eval` at line 1, column
3970 (`Function("")` capability probe), then four events at column 36184
(generated validators). These are build-specific diagnostic coordinates, not
an allowlist. Next's `instrumentation-client.ts` configures `z.config({ jitless:
true })` before application modules construct contracts. Zod is already pinned
by contracts; web now declares that same direct dependency, without a version
upgrade or additional dependency tree. A regression test replaces `Function`
with a throwing spy and verifies interpreted validation accepts inert text and
rejects unknown keys and oversized values without calling the spy.

Sources: [Next bootstrap ordering](https://github.com/vercel/next.js/blob/v16.3.4/packages/next/src/client/app-next.ts),
[Next default fallback](https://github.com/vercel/next.js/blob/v16.3.4/packages/next/src/client/components/http-access-fallback/error-fallback.tsx),
[Zod eval probe](https://github.com/colinhacks/zod/blob/v4.5.4/packages/zod/src/v4/core/util.ts),
and [Zod object interpreter/JIT selection](https://github.com/colinhacks/zod/blob/v4.5.4/packages/zod/src/v4/core/schemas.ts).
Late configuration is insufficient: Zod caches capability and construction-time
JIT decisions. Do not import schema-heavy modules into the instrumentation hook
or use explicit `z.compile` in browser code. No Next patch, unsafe CSP fallback,
or report suppression is used.

The browser compatibility portion of V3.4.1–V3.4.6 now has passing enforced
built-container evidence. Issue #76 remains open: deployment HSTS and
proxy-generated failure responses still require a real supported TLS ingress.
Neither plaintext Compose nor an Orb portal proves that deployment criterion.

### Follow-up verification results

- Docker `pnpm test`: 1,836 passed, four skipped (188 passing files).
- Docker `pnpm typecheck`, `pnpm format:check`, and `pnpm lint`: passed;
  lint retains four existing warnings, zero errors.
- Built policy and ATS/PDF commands above: five passed in report-only and five
  passed in explicit enforcement, with empty violation attachments in every test.
- Enforced deterministic import-to-PDF journey: real PDF passed through review,
  confirmation, editing, saved preview, extracted PDF text/order, and reopen,
  with zero CSP events. The suite's stale global language selector and removed
  confirmation-dialog expectation were aligned with the implemented UI.
- The companion real DOCX journey did **not** pass: it timed out waiting 90
  seconds for review. Worker evidence reached `validation_completed` but not
  extraction completion; the browser stayed on processing and recorded zero
  CSP events. API/worker code and images were unchanged by the CSP fixes. This
  is a remaining import/extraction verification limitation, not evidence of a
  passing full Local Play suite; do not suppress or loosen its timeout here.
- Enforced custom 404 rendered and was inspected at 1280px and 390px Chromium
  widths: readable content and navigation, no clipping or inline styles.

No schema migrations, credential changes, provider changes, external resource
origins, or additional runtime services in the normal deployment are required.
