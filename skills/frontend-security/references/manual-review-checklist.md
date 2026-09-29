# Manual Security Review — What Automation Misses (Frontend Scope)

Adapted with attribution from a personal OWASP ASVS 4.0.3 L2 manual-verification checklist the
owner maintains for a separate multi-project ecosystem (`adrii-docs/manual-audit/GOVERNANCE/ASVS-L2-MANUAL.md`).
Only the frontend-relevant items are kept here, retargeted to ASVS 5.0's chapter numbers (the
source document predates the 5.0 renumbering). The original's own stated principle carries over
exactly: **automation covers patterns, not business logic or runtime behavior** — this checklist is
for the items no linter or scanner can see.

## Cookie flags (ASVS 5.0 V3/V12 — session cookie hardening)

1. Open DevTools → Application → Cookies on the deployed app.
2. Verify `HttpOnly` is true on the session cookie — if JavaScript can read it
   (`document.cookie` includes it), any XSS becomes a full session-theft primitive.
3. Verify `Secure` is true in production (acceptable to be false on `localhost` only).
4. Verify `SameSite`: `Strict` when frontend and backend share a registrable domain; `None; Secure`
   when they're on different domains (e.g. a Vercel frontend calling a Railway backend) — never
   `Lax` for an authenticated session cookie.
5. **Red flag**: `HttpOnly: false` on a session cookie is fatal — treat it as a blocking finding.

## CSP header presence and shape (ASVS 5.0 V3)

1. `curl -I https://{domain}` and look for a `Content-Security-Policy` header.
2. Confirm it does not contain `'unsafe-inline'` or `'unsafe-eval'` in `script-src` (both defeat the
   point of having a CSP at all) — if present, this is a strong candidate for the
   nonce-based-with-report-only-rollout path in SKILL.md.
3. Cross-check the deployed policy against `https://securityheaders.com/?q={domain}` for a full
   picture including HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

## CORS whitelist vs. string matching (client-observable half)

1. Read any shared/BFF code that sets `Access-Control-Allow-Origin` dynamically.
2. **Red flag**: `origin.includes('example.com')` or `origin.endsWith('.example.com')` — both are
   bypassable (`evil-example.com`, `example.com.evil.com`). The correct shape is an explicit array
   compared with strict equality/`.includes()` on the whole string:
   `['https://example.com', 'http://localhost:4200'].includes(origin)`.
3. A wildcard (`*`) origin combined with `Access-Control-Allow-Credentials: true` is invalid per the
   Fetch spec and should never be observed together — if it is, the endpoint is misconfigured.

## IDOR — the one no scanner catches (ASVS 5.0 V4/V8, backend-owned but frontend-visible)

Not this skill's primary scope (it's a backend authorization defect), but a frontend engineer is
often the first to notice it: if changing an id in a URL or request payload that the *frontend*
constructs (e.g. `/api/orders/{id}`) returns another user's data, that's a finding to escalate
immediately, not something to route around client-side.

## Third-party script integrity (ASVS 5.0 V1/V15, OWASP Top 10:2025 A08)

1. Every `<script src="https://...">` loading from a third-party origin should carry
   `integrity="sha384-..."` (Subresource Integrity) and `crossorigin="anonymous"`.
2. **Red flag**: a third-party script loaded without SRI — if that CDN is compromised, the injected
   code runs with full page privileges and no CSP `script-src` restriction will catch it unless the
   CSP also omits that origin (defense in depth: prefer self-hosting critical third-party scripts).
