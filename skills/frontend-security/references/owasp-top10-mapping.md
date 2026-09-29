# OWASP Top 10:2025 — Full Category List with Frontend Relevance

Source: [OWASP Top 10:2025](https://top10.owasp.org/2025/) (current edition; supersedes 2021).
Changes vs. 2021: two new categories (A03 Software Supply Chain Failures, A10 Mishandling of
Exceptional Conditions), several re-rankings and renames, and Server-Side Request Forgery (its own
category in 2021 as A10) was absorbed into A01 Broken Access Control.

| # | Category | Frontend relevance |
|---|---|---|
| A01 | Broken Access Control | Client enforces UX only — never the security boundary; still flag any client-only authorization decision (hidden button, disabled-not-removed action) found in review. |
| A02 | Security Misconfiguration | High — missing/misconfigured security headers (CSP, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy) are a frontend/deploy-config concern. |
| A03 | Software Supply Chain Failures | High — npm dependency tree: typosquatting, compromised maintainer accounts, unpinned transitive versions, build-time script execution (`postinstall`). Gate with `npm audit`/`osv-scanner` + lockfile review. |
| A04 | Cryptographic Failures | Frontend-adjacent — never implement crypto client-side for anything security-relevant beyond what the Web Crypto API's documented use cases cover; storing secrets in `localStorage`/`sessionStorage` is a cryptographic-failure-adjacent mistake (no encryption at rest, readable by any XSS). |
| A05 | Injection | High — DOM-based XSS is injection executing in the browser; this is this skill's core scope (see SKILL.md's output-encoding table). |
| A06 | Insecure Design | Frontend-adjacent — e.g. a password-reset flow that can be raced or a UI that implies client-side validation is sufficient. |
| A07 | Authentication Failures | Frontend-adjacent — token storage location (cookie vs. `localStorage`), silent-refresh flow design, logout not clearing all client state. |
| A08 | Software or Data Integrity Failures | Frontend-adjacent — loading a third-party script without Subresource Integrity (SRI), auto-updating dependencies without review. |
| A09 | Security Logging and Alerting Failures | Mostly backend, but a frontend that swallows/silences errors without any telemetry contributes to this. |
| A10 | Mishandling of Exceptional Conditions | Frontend-adjacent — an unhandled promise rejection or error boundary that leaks a stack trace or internal state to the user. |

## Where this skill stops

A01, A06, A07 (session/token lifecycle), A09 in their full depth are backend/architecture concerns —
OWASP ASVS chapters V6 Authentication, V7 Session Management, V8 Authorization, V16 Security
Logging own that ground. This skill's SKILL.md focuses on A02, A03, and A05 because those are where
a frontend engineer working in Angular/React directly writes the vulnerable or protective code.
