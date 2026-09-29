---
name: frontend-security
description: >
  This skill should be used when the user asks about frontend/client-side security — "XSS",
  "CSP", "Content Security Policy", "Trusted Types", "innerHTML sanitization", "dangerouslySetInnerHTML",
  "CORS", "cookie flags", "secrets in the bundle", "dependency vulnerabilities", "npm audit",
  "OWASP", "security headers", "clickjacking", "CSRF" — for an Angular or React application. Scope
  is the browser-side attack surface (output encoding, DOM XSS sinks, CSP/Trusted Types rollout,
  cookie/CORS configuration as seen from the client, dependency and secret scanning). Backend
  authN/authZ/session/business-logic security (OWASP ASVS V6-V10, V14) is out of scope for this
  skill — see the ASVS reference below and delegate that to a backend security review.
license: MIT
metadata:
  owner: b100-am-ui cross-cutting skills
  scope: OWASP Top 10:2025, ASVS 5.0 (frontend-relevant chapters), CSP/Trusted Types, XSS prevention
  companions: gates-kit/README.md (executable gates), ~/.claude/checklists (none yet for security — this skill is the checklist)
---

# Frontend Security

Scope: the browser-side half of application security — what an Angular/React frontend controls
directly (output encoding, DOM XSS sinks, CSP, cookies as configured/read from the client, CORS as
experienced by a fetch/XHR call, dependency/secret hygiene of the frontend bundle). Server-side
authentication, authorization, session lifecycle, and business-logic validation are real and
important but belong to a backend security skill/review — OWASP ASVS chapters V6-V10 and V14 own
that ground; this skill does not duplicate it.

## OWASP Top 10:2025 — which categories a frontend actually touches

Source: [OWASP Top 10:2025](https://top10.owasp.org/2025/) (current, supersedes the 2021 edition).
Full 10: A01 Broken Access Control, A02 Security Misconfiguration, A03 Software Supply Chain
Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication
Failures, A08 Software or Data Integrity Failures, A09 Security Logging and Alerting Failures, A10
Mishandling of Exceptional Conditions. (SSRF was absorbed into A01 Broken Access Control in this
edition; two categories — A03 Supply Chain Failures and A10 Mishandling of Exceptional Conditions —
are new since 2021.)

**Frontend-owned categories**: A02 (security headers/CSP misconfiguration), A03 (npm dependency
supply chain — typosquatting, compromised packages, unpinned transitive deps), A05 (DOM-based
XSS is injection executing in the browser). **Frontend-adjacent** (client enforces UX, server must
still enforce): A01 (never trust a hidden button as authorization), A07 (never store tokens
insecurely — see cookie flags below).

## XSS prevention — output encoding by context

Source: [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).
The rule is **context determines the encoding** — there is no single "escape this string" function
that is safe everywhere:

| Context | Rule | Safe sink |
|---|---|---|
| HTML body | HTML-entity encode (`&`,`<`,`>`,`"`,`'`) | `.textContent` (auto-encodes) |
| HTML attribute | Encode every non-alphanumeric char as `&#xHH;`; always quote the attribute | `.setAttribute()` with a hardcoded attribute name |
| JavaScript (quoted string literal only) | `\xHH` for every non-alphanumeric char; never place a variable in any other JS context | — |
| CSS property value | `\XX`/`\XXXXXX` hex escape; never in selectors | `style.property = x` (auto-encodes) |
| URL parameter value | Percent-encode (never the whole URL/path) | `encodeURIComponent(x)` |

**Angular**: `DomSanitizer` strips dangerous content by default for `[innerHTML]`; bypassing it
(`bypassSecurityTrustHtml`) re-opens the exact hole DomSanitizer exists to close — every bypass call
is a finding that needs a written justification, not a routine pattern. Reactive-forms-only is
already this project's own convention (`AGENT-LEDGER.md` §8) and incidentally removes an entire
class of template-injection risk that `[(ngModel)]` + unsanitized dynamic templates can create.

**React**: `dangerouslySetInnerHTML` is the equivalent bypass — every use should wrap the value in
DOMPurify (or an equivalent allowlist sanitizer) at the point of use, not "trust the caller already
sanitized it".

## Content Security Policy — rollout without breaking the app

Source: [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html),
[MDN CSP Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

**Strict CSP (nonce-based, preferred for SSR/dynamic templating)**:
```
Content-Security-Policy: script-src 'nonce-{RANDOM-PER-RESPONSE}' 'strict-dynamic';
  object-src 'none'; base-uri 'none';
```
Generate a fresh, cryptographically random nonce per response server-side and thread it to every
`<script>` tag. **Never** build middleware that rewrites all `<script>` tags to add nonces
indiscriminately — an attacker-injected `<script>` tag would receive the same nonce and execute.

**Hash-based** (`'sha256-{hash}'`) is the alternative for static, unchanging inline scripts — fragile
because any whitespace/formatting change invalidates the hash; prefer nonces for anything templated.

**Report-only rollout** (the safe path to a strict policy on an existing app): ship a strict
`Content-Security-Policy-Report-Only` header alongside a looser *enforced* `Content-Security-Policy`
header. This collects real violation reports without breaking production, then tighten the enforced
policy once reports are clean. Use `report-to` (CSP Level 3) as the primary reporting directive,
keep `report-uri` alongside it for older browsers.

## Trusted Types — closing DOM XSS sinks at the platform level

Source: [MDN Trusted Types API](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API).

```js
const policy = trustedTypes.createPolicy('app-html', {
  createHTML: (input) => DOMPurify.sanitize(input),
});
element.innerHTML = policy.createHTML(userInput); // safe
```
The CSP directive `require-trusted-types-for 'script'` makes the browser **throw a TypeError** on
any direct string assignment to a dangerous sink instead of silently executing it — this converts
an entire class of DOM XSS from "hope the code review caught it" to "the browser refuses to run it".
Protected sinks: `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`Document.write`/`srcdoc` (TrustedHTML);
`eval`/`Function`/`setTimeout` string form (TrustedScript); `<script src>`/`Worker()` URL
(TrustedScriptURL). Angular's `DomSanitizer` and Trusted Types are complementary, not redundant —
enabling `require-trusted-types-for` is the platform-level backstop for the rare bypass or
third-party script that skips DomSanitizer entirely.

## ASVS — what's frontend-owned

Source: [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/)
(current stable; note: `~/.claude/checklists`-adjacent reference material from prior audits may
still cite ASVS 4.0.3 — the chapter numbering changed materially in 5.0, re-verify chapter numbers
before quoting them). ASVS 5.0's 17 chapters: V1 Encoding/Sanitization, V2 Validation/Business
Logic, **V3 Web Frontend Security** (CSP, clickjacking defenses, browser-side hardening — the
chapter most relevant here), V4 API/Web Service, V5 File Handling, V6 Authentication, V7 Session
Management, V8 Authorization, V9 Self-contained Tokens, V10 OAuth/OIDC, V11 Cryptography, V12
Secure Communication, V13 Configuration, V14 Data Protection, V15 Secure Coding/Architecture, V16
Security Logging/Error Handling, V17 WebRTC. V6-V10 and most of V14 are backend-owned; V1, V3, and
the browser-facing half of V12/V13 (HSTS, security headers) are frontend-owned.

## Cookie/CORS — the client-visible half

- **Cookie flags**: `HttpOnly` (JS cannot read it — the single highest-value XSS mitigation for
  session cookies), `Secure` (HTTPS-only in production), `SameSite=Strict` when frontend and backend
  share a registrable domain, `SameSite=None; Secure` when they don't (e.g. separate deploy
  targets) — never rely on `SameSite=Lax` for an authenticated session cookie.
- **CORS**: the frontend cannot fix a misconfigured `Access-Control-Allow-Origin`, but it can be the
  canary — a wildcard (`*`) origin on an endpoint that also sends credentials is invalid per spec
  and a red flag; `origin.includes('example.com')`/`.endsWith('.example.com')` string-matching on
  the *server* is bypassable (`evil-example.com`) — this is a server-side finding a frontend
  reviewer should still flag when spotted in shared/BFF code.

## Reused reference material (attributed)

`references/manual-review-checklist.md` adapts structure and specific test cases (IDOR-per-resource,
cookie-flag verification steps, CSP-header-via-curl checks) from a personal ASVS L2 manual-review
checklist the owner maintains for the wider ecosystem — reused here with attribution as a manual
companion to the automated gates in `gates-kit/README.md`, not duplicated verbatim; only the
frontend-relevant subset is kept, retargeted to ASVS 5.0's chapter numbers.

## What this skill does NOT replace

- **Tool execution** (Semgrep, ESLint security plugin, gitleaks, npm audit/osv-scanner, ZAP) — see
  `gates-kit/README.md` for exact configs and what each tool actually catches.
- **Backend security** — ASVS V4, V6-V10, V14 (auth, session, business logic, server-side data
  protection) need a backend-focused review; this skill intentionally stops at the browser boundary.

## Additional resources

- `references/owasp-top10-mapping.md` — full Top 10:2025 category list with frontend-relevance notes.
- `references/manual-review-checklist.md` — manual verification steps for what automated tools miss
  (IDOR, cookie/CORS runtime checks, CSP header verification), adapted with attribution.
