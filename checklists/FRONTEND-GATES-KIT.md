# Gates Kit — Executable Quality Gates for a Fresh Angular/React Consumer Project

A menu of **tool-based, parser/AST-based, or official-scanner-based** quality gates a new project
can adopt on day one. Every entry here executes a real tool against real output — none of it is a
regex-over-source-text pipeline. That constraint is deliberate: a personal reference repo
(`adrii-docs`) the owner also maintains has a 379-line regex/grep audit pipeline
(`scripts/run-audit.sh`) that was explicitly **rejected** for this project because it violates the
no-regex mandate (`~/.claude/rules/00-owner-mandates.md`: "grep localiza, NO dictamina" — a search
locates candidates, it never renders a verdict). Everywhere this kit reuses content from that repo's
checklists or configs, it's re-framed as a parser/tool invocation, never a grep pipeline, and it's
cited so the difference is visible.

**Columns**: *Catches* = what class of defect the gate actually detects. *False-positive risk* =
how often it flags something that isn't really a problem (drives whether it can be a hard CI gate
vs. advisory). *CI cost* = wall-clock cost per run, rough order of magnitude. *In b100-am-ui* =
whether this library's own `package.json` already runs an equivalent (✅) or a fresh consumer
project needs to add it from scratch (—).

## Ranked menu — value per unit of cost

Ordered highest-value-per-cost first within each tier. **Tier 1** (adopt on day one, cheap, low
false-positive): static/parser-based checks that run in seconds and rarely cry wolf. **Tier 2**
(adopt once Tier 1 is green): tools needing a running app or network access, higher cost or
higher false-positive risk, worth gating but not on every keystroke. **Tier 3** (adopt when the app
handles real user data or ships to production): deeper/slower scans, still automatable but with
real setup cost and/or requiring a staging environment.

### Tier 1 — static, parser/AST-based, seconds per run

| # | Tool | Config / npm script | Catches | FP risk | CI cost | In b100-am-ui |
|---|---|---|---|---|---|---|
| 1 | **gitleaks** | `gitleaks detect --source . --config .gitleaks.toml` (pre-commit + CI) | Committed secrets (API keys, JWTs, tokens) | Low (default ruleset; raise entropy threshold to 3.5 to cut base64/UUID noise — see below) | ~1-5s | — |
| 2 | **ESLint `eslint-plugin-security`** | flat config, see below | `eval`, dynamic `require`, unsafe regex (ReDoS), timing attacks, object injection, `child_process` | Medium (`detect-object-injection`, `detect-non-literal-fs-filename` need `warn` not `error` — legitimately noisy on dynamic-but-safe code) | seconds (part of normal lint run) | — |
| 3 | **ESLint `eslint-plugin-jsx-a11y`** (React) / **`@angular-eslint/template` a11y rules** (Angular) | flat config | Missing alt text, invalid ARIA attrs, non-interactive elements with handlers, missing form labels | Low | seconds | Angular: partial (project uses harnesses + axe, not template a11y lint rules — a gap worth closing, see below) |
| 4 | **`npm audit --audit-level=high`** or **osv-scanner** | `npm audit` / `osv-scanner --lockfile=package-lock.json` | Known CVEs in the dependency tree | Medium (transitive-only, unreachable-code CVEs still flag — needs a documented, expiring ignore list) | seconds-1min | — |
| 5 | **TypeScript `strict` + `noUncheckedIndexedAccess`** | `tsconfig.json` | Null/undefined access, implicit any, unsound indexing | Low | seconds (part of typecheck) | ✅ (strict TS is this project's baseline) |
| 6 | **HTML validation (`html-validate` or W3C Nu Validator via `vnu.jar`)** | `html-validate` npm package against SSR/prerendered output | Invalid markup, duplicate IDs, missing `lang`, malformed ARIA | Low | seconds | — |
| 7 | **robots.txt / sitemap.xml structural validation** | small script using a real XML parser (`fast-xml-parser`) + `robots-parser` npm package, never regex | Malformed sitemap XML, >50k URL limit breach, missing `Sitemap:` cross-reference in robots.txt, orphaned `Disallow` rules | Low | seconds | — |
| 8 | **Structured data (JSON-LD) schema validation** | `structured-data-testing-tool` or Google's [Rich Results Test](https://search.google.com/test/rich-results) API, scripted | Missing required schema.org properties, invalid `@type` | Low-medium (schema-type support list changes over time) | seconds-1min | — |

### Tier 2 — needs a running app, higher cost or FP risk

| # | Tool | Config / npm script | Catches | FP risk | CI cost | In b100-am-ui |
|---|---|---|---|---|---|---|
| 9 | **Semgrep — official registry rulesets** | `semgrep --config=p/owasp-top-ten --config=p/typescript --config=p/javascript --config=p/react .` | OWASP Top 10 patterns, framework-specific unsafe sinks (`dangerouslySetInnerHTML`, JWT `none`-alg, hardcoded secrets pattern) | Low for registry rulesets (AST `pattern:`/`pattern-either:` matching) — **medium-high if a custom rule uses `pattern-regex:`**, which is Semgrep's own regex escape hatch; treat any `pattern-regex:` rule the same as a banned regex-over-source scan | ~10-30s | — |
| 10 | **axe via Playwright** (`@axe-core/playwright`) against Storybook stories or live routes | Playwright test file asserting `AxeBuilder(page).analyze()` has zero violations | Contrast, ARIA validity, landmark structure, label presence — the same engine Lighthouse's a11y category uses | Low | ~10s-2min depending on story count | ✅ `check:a11y` (`storybook:build:ci` + `test-storybook:ci`), `check:demo-a11y` |
| 11 | **Lighthouse CI budgets** | `.lighthouserc.cjs` with `assert.assertions` on LCP/CLS/TBT/resource-summary — see `web-performance` skill's `references/budget-examples.md` for a ready config | Performance regressions (LCP/CLS/TBT as lab proxies), a11y score regressions, best-practices/SEO score regressions | Medium (lab metrics vary run-to-run — always set `numberOfRuns: 3` and assert on median) | ~30s-2min per page | ✅ `check:lighthouse` (`lhci autorun`) |
| 12 | **Bundle-size budgets** | Angular: `budgets` in `angular.json`; React/Vite: `size-limit` package or `webpack-bundle-analyzer` + custom check | Bundle bloat before it becomes a timing regression | Low | seconds (reads `dist/` sizes, no browser) | ✅ `check:bundle-size`, `check:bundle-duplication` |
| 13 | **Visual regression** (Playwright snapshot diffing) | `playwright test --config playwright.config.ts` with `toHaveScreenshot()` | Unintended visual/layout changes across viewports/themes | Medium-high (font rendering, animation timing, OS-level rendering differences need careful CI-container pinning) | ~1-5min | ✅ `visual:check`, `visual:docker` (Docker-pinned baselines) |
| 14 | **CSP report-only rollout** | Deploy-config header, not a test — `Content-Security-Policy-Report-Only: script-src 'nonce-{per-response}' 'strict-dynamic'; object-src 'none'; report-to csp-endpoint` alongside a looser enforced policy | Real violation reports from production traffic before tightening the enforced policy | N/A (monitoring, not a pass/fail gate) | zero CI cost, ongoing monitoring cost | — |

### Tier 3 — deep scans, real setup cost, run less often (nightly/pre-release)

| # | Tool | Config / npm script | Catches | FP risk | CI cost | In b100-am-ui |
|---|---|---|---|---|---|---|
| 15 | **OWASP ZAP baseline scan** (passive only — never active-scan a production target) | `zap-baseline.py -t $STAGING_URL -c zap-baseline.conf -J report.json` — reuse the rule-ID/threshold table from `adrii-docs/configs/audit/zap-baseline.conf` (attributed; passive baseline config is safe to reuse as-is) | Missing security headers (CSP/HSTS/X-Frame-Options), reflected/stored XSS visible in passive traffic, CSRF token absence | Low-medium for HIGH-tier rules (XSS/SQLi/CSRF); expect noise on MEDIUM (header-hygiene) rules on a fresh project — start those as `WARN` not `FAIL` | ~5min (hard-capped) | — |
| 16 | **Trivy filesystem scan** | `trivy fs --severity CRITICAL,HIGH .` + a `.trivyignore` with mandatory CVE/reason/reviewed-date/expiry-date fields (max 90-day expiry) — format reused with attribution from `adrii-docs/configs/audit/.trivyignore.global` | CVEs in dependencies and container base images, exposed secrets in filesystem | Medium (reachability isn't checked — a CVE in an unreachable code path still flags; the ignore-file discipline is what keeps this honest) | ~10-30s | — |
| 17 | **CSP enforced (after report-only burn-in)** | `Content-Security-Policy` header, enforced | Blocks the XSS classes CSP covers, in production, not just in reports | Low once burned in via report-only first | zero CI cost | — |
| 18 | **Trusted Types enforced** (`require-trusted-types-for 'script'`) | CSP directive + `trustedTypes.createPolicy()` at every dangerous-sink call site | Any remaining direct-string-to-`innerHTML`/`eval` assignment, including from a compromised third-party script | Low, but requires auditing every existing sink first (one-time migration cost, not ongoing FP risk) | zero CI cost once migrated | — |

## Exact configs for the highest-value entries

### 2. ESLint security plugin (flat config)

Reused with attribution from `adrii-docs/configs/audit/eslint-security.config.js` (all 13 rules,
framework-agnostic):

```js
import securityPlugin from 'eslint-plugin-security';

export default [{
  plugins: { security: securityPlugin },
  rules: {
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'error',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-new-buffer': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-require': 'error',
    'security/detect-object-injection': 'warn',
    'security/detect-possible-timing-attacks': 'error',
    'security/detect-pseudoRandomBytes': 'error',
    'security/detect-unsafe-regex': 'error',
  },
}];
```

### 1. gitleaks

Reused with attribution from `adrii-docs/configs/audit/.gitleaks.toml` — extends the default
ruleset, adds provider-specific rules (adapt provider list to the actual stack in use), raises
entropy threshold from 3.0→3.5 to cut false positives on base64/hashes/UUIDs:

```toml
[extend]
useDefault = true

[[rules]]
id = "supabase-service-role-jwt"
description = "Supabase service_role JWT (bypasses RLS if leaked)"
regex = '''eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{100,}\.[A-Za-z0-9_-]{20,}'''
tags = ["key", "supabase", "jwt", "CRITICAL"]

[allowlist]
paths = ['''\.env\.example''', '''.*\.spec\.ts$''', '''node_modules/.*''']

[extend.entropy]
Min = 3.5
```
(Note: gitleaks' *own* rule definitions are necessarily regex-based — that's how a secret-scanner
inherently works, matching known key-format shapes. This is different in kind from the no-regex
mandate's target, which is regex used as a substitute for a real parser/linter over *source code
structure*. Scanning for a known credential shape is the correct tool for that specific job.)

### 9. Semgrep — the no-regex-compliant subset

```bash
semgrep --config=p/owasp-top-ten --config=p/typescript --config=p/javascript \
        --config=p/react --config=p/secrets --config=p/jwt .
```
These are official registry rulesets using real AST `pattern:`/`pattern-either:` matching — genuinely
parser-based, not text search. **Do not** add a custom rule using `pattern-regex:` (Semgrep's own
regex escape hatch) as a substitute for a proper AST pattern; if a custom rule is needed (e.g.
banning a specific unsafe API call), write it as `pattern-either:` with real code shapes, the way
Semgrep's own registry rules do.

### 15. OWASP ZAP baseline — passive-only, safe defaults

Reused as-is from `adrii-docs/configs/audit/zap-baseline.conf` (rule IDs per
[zaproxy.org/docs/alerts](https://www.zaproxy.org/docs/alerts/)):
```
# HIGH IMPACT — always FAIL
10202  FAIL  # Absence of anti-CSRF tokens (POST forms)
40012  FAIL  # Cross Site Scripting (reflected)
40018  FAIL  # SQL Injection
90020  FAIL  # Remote OS Command Injection
# MEDIUM — WARN, review in report, don't block a fresh project's first CI run
10035  WARN  # Strict-Transport-Security not set
10038  WARN  # Content Security Policy header not set
```
Run against a staging URL only, never production — the baseline scan is passive (observes
requests/responses, never actively injects), but the *target* still shouldn't be prod out of general
caution.

## Gaps — where no tool exists and a checklist is the only control

Some of what a "quality gate" needs to catch has no reliable automated check. For these, the control
is a manual checklist, not a missing gate to eventually build:

1. **Business-logic security** (IDOR, race conditions/TOCTOU, price/discount tampering, MFA-bypass
   flows) — no static or dynamic scanner reasons about domain semantics. Control: manual
   per-resource testing, structured by OWASP ASVS 5.0 chapters V2 (Validation/Business Logic), V6-V8
   (Authentication/Session/Authorization). The `frontend-security` skill's
   `references/manual-review-checklist.md` has the frontend-visible subset (IDOR spotting, cookie/
   CORS runtime verification); the full backend-owned checklist is out of this kit's scope.
2. **Whether the reading order matches visual order**, and **whether a live region actually
   announces at the right moment** — axe/Lighthouse cannot execute a screen reader. Control:
   `~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md` manual pass + the `web-accessibility` skill's
   pattern reference for what *should* happen.
3. **UI state completeness** (does every route have a real loading/empty/error treatment, not just a
   spinner-then-crash) — no tool enumerates "the states a route should have" from outside. Control:
   `~/.claude/checklists/UI-STATES-CHECKLIST.md`'s route × state matrix.
4. **Design token discipline beyond hardcoded-value detection** (is this the *right* semantic token,
   not just *a* token) — a linter can catch a raw hex value but not "this should be `primary`, not
   `secondary`". Control: `~/.claude/checklists/DESIGN-TOKENS-CHECKLIST.md` + the `ui-ux-quality`
   skill's Material 3 token-tier reference for what "right" means.
5. **Structured-data content-visibility guideline compliance** (Google forbids marking up content not
   actually visible on the page) — schema validators check shape, not whether the marked-up content
   is genuinely rendered and visible. Control: manual spot-check during the `seo-technical` skill's
   review pass.
6. **E-E-A-T / content quality / editorial SEO** — entirely out of scope for any tool in this kit;
   genuinely needs human editorial judgment.
7. **Threat modeling and security architecture review** (STRIDE-style) — a design-time activity, not
   a code-time gate. If needed, a STRIDE template exists in the owner's personal reference repo
   (`adrii-docs/manual-audit/GOVERNANCE/STRIDE-TEMPLATE.md`) and can be adapted per-feature; it's a
   process artifact, not something this kit automates.

## Provenance note

Content in this kit derived from `adrii-docs` (the owner's personal, separate reference repo) is
explicitly re-attributed here rather than silently reused: the ESLint security config, gitleaks
config, and ZAP baseline config are reused close to verbatim (tool configs, not code-structure
regex); the ASVS-L2 manual checklist and SEO skill content are adapted and re-verified against
current primary sources rather than copied. `adrii-docs`'s own `scripts/run-audit.sh`/`audit-full.sh`
orchestration layer (379 grep/regex invocations) was read and explicitly **not** reused — see the
intro above.
