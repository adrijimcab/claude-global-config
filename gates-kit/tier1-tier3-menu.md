# Ranked Gate Menu — Value per Unit of Cost

Ordered highest-value-per-cost first within each tier. **Tier 1** (adopt on day one, cheap, low
false-positive): static/parser-based checks that run in seconds and rarely cry wolf. **Tier 2** (adopt
once Tier 1 is green): tools needing a running app or network access, higher cost or higher
false-positive risk, worth gating but not on every keystroke. **Tier 3** (adopt when the app handles
real user data or ships to production): deeper/slower scans, still automatable but with real setup cost
and/or requiring a staging environment.

**Columns**: *Catches* = what class of defect the gate actually detects. *False-positive risk* = how
often it flags something that isn't really a problem (drives whether it can be a hard CI gate vs.
advisory). *CI cost* = wall-clock cost per run, rough order of magnitude. *Reference impl* = whether a
real project already runs an equivalent (✅ `b100-am-ui`, the owner's own component library) or a
fresh project needs to add it from scratch (—) — a worked example to copy from, not a requirement that
every project match it.

@es Ordenado de mayor a menor valor por costo dentro de cada tier. **Tier 1**: chequeos estáticos/
parser que corren en segundos y casi nunca dan falso positivo — adoptar desde el día uno. **Tier 2**:
herramientas que necesitan una app corriendo o acceso de red, mayor costo o riesgo de falso positivo —
adoptar una vez Tier 1 esté verde. **Tier 3**: escaneos más profundos/lentos, para cuando la app maneja
datos reales de usuario o va a producción. La columna *Reference impl* apunta a un proyecto real
(`b100-am-ui`) que ya corre el equivalente — es un ejemplo para copiar, no un requisito de igualarlo.

## Tier 1 — static, parser/AST-based, seconds per run

| # | Tool | Config / npm script | Catches | FP risk | CI cost | Reference impl |
|---|---|---|---|---|---|---|
| 1 | **gitleaks** | `gitleaks detect --source . --config .gitleaks.toml` (pre-commit + CI) | Committed secrets (API keys, JWTs, tokens) | Low (default ruleset; raise entropy threshold to 3.5 to cut base64/UUID noise — see below) | ~1-5s | — |
| 2 | **ESLint `eslint-plugin-security`** | flat config, see below | `eval`, dynamic `require`, unsafe regex (ReDoS), timing attacks, object injection, `child_process` | Medium (`detect-object-injection`, `detect-non-literal-fs-filename` need `warn` not `error` — legitimately noisy on dynamic-but-safe code) | seconds (part of normal lint run) | — |
| 3 | **ESLint `eslint-plugin-jsx-a11y`** (React) / **`@angular-eslint/template` a11y rules** (Angular) | flat config — see `react.md` / `angular.md` | Missing alt text, invalid ARIA attrs, non-interactive elements with handlers, missing form labels | Low | seconds | Angular: partial in `b100-am-ui` (harnesses + axe, not template a11y lint rules — a gap worth closing, see `angular.md`) |
| 4 | **`npm audit --audit-level=high`** or **osv-scanner** | `npm audit` / `osv-scanner --lockfile=package-lock.json` (blocking CI job: `templates/gitlab-ci-quality/.gitlab-ci.yml`) | Known CVEs in the dependency tree | Medium (transitive-only, unreachable-code CVEs still flag — needs a documented, EXPIRING ignore entry per the no-hidden-failures rule, never a blanket ignore) | seconds-1min | — |
| 5 | **TypeScript `strict` + `noUncheckedIndexedAccess`** | `tsconfig.json` | Null/undefined access, implicit any, unsound indexing | Low | seconds (part of typecheck) | ✅ (strict TS is `b100-am-ui`'s baseline) |
| 6 | **HTML validation (`html-validate` or W3C Nu Validator via `vnu.jar`)** | `html-validate` npm package against SSR/prerendered output | Invalid markup, duplicate IDs, missing `lang`, malformed ARIA | Low | seconds | — |
| 7 | **robots.txt / sitemap.xml structural validation** | small script using a real XML parser (`fast-xml-parser`) + `robots-parser` npm package, never regex | Malformed sitemap XML, >50k URL limit breach, missing `Sitemap:` cross-reference in robots.txt, orphaned `Disallow` rules | Low | seconds | — |
| 8 | **Structured data (JSON-LD) schema validation** | `structured-data-testing-tool` or Google's [Rich Results Test](https://search.google.com/test/rich-results) API, scripted | Missing required schema.org properties, invalid `@type` | Low-medium (schema-type support list changes over time) | seconds-1min | — |

## Tier 2 — needs a running app, higher cost or FP risk

| # | Tool | Config / npm script | Catches | FP risk | CI cost | Reference impl |
|---|---|---|---|---|---|---|
| 9 | **Semgrep — official registry rulesets** | `semgrep --config=p/owasp-top-ten --config=p/typescript --config=p/javascript --config=p/react .` | OWASP Top 10 patterns, framework-specific unsafe sinks (`dangerouslySetInnerHTML`, JWT `none`-alg, hardcoded secrets pattern) | Low for registry rulesets (AST `pattern:`/`pattern-either:` matching) — **medium-high if a custom rule uses `pattern-regex:`**, which is Semgrep's own regex escape hatch; treat any `pattern-regex:` rule the same as a banned regex-over-source scan | ~10-30s | — |
| 10 | **axe via Playwright** (`@axe-core/playwright`) against Storybook stories or live routes | Playwright test file asserting `AxeBuilder(page).analyze()` has zero violations | Contrast, ARIA validity, landmark structure, label presence — the same engine Lighthouse's a11y category uses | Low | ~10s-2min depending on story count | ✅ `check:a11y`, `check:demo-a11y` (`b100-am-ui`) |
| 11 | **Lighthouse CI budgets** | `.lighthouserc.cjs` (copyable, median of 3 with accessibility as an error: `templates/gitlab-ci-quality/.lighthouserc.cjs`) with `assert.assertions` on LCP/CLS/TBT/resource-summary — see the `web-performance` skill's budget reference for a ready config | Performance regressions (LCP/CLS/TBT as lab proxies), a11y score regressions, best-practices/SEO score regressions | Medium (lab metrics vary run-to-run — always set `numberOfRuns: 3` and assert on median) | ~30s-2min per page | ✅ `check:lighthouse` (`b100-am-ui`) |
| 12 | **Bundle-size budgets** | Angular: `budgets` in `angular.json`; React/Vite: `size-limit` package or `webpack-bundle-analyzer` + custom check | Bundle bloat before it becomes a timing regression | Low | seconds (reads `dist/` sizes, no browser) | ✅ `check:bundle-size` (`b100-am-ui`) |
| 13 | **Visual regression** (Playwright snapshot diffing) | `playwright test` with `toHaveScreenshot()` | Unintended visual/layout changes across viewports/themes | Medium-high (font rendering, animation timing, OS-level rendering differences need careful CI-container pinning) | ~1-5min | ✅ `visual:check`, `visual:docker` (`b100-am-ui`) |
| 14 | **CSP report-only rollout** | Deploy-config header, not a test — `Content-Security-Policy-Report-Only: script-src 'nonce-{per-response}' 'strict-dynamic'; object-src 'none'; report-to csp-endpoint` alongside a looser enforced policy | Real violation reports from production traffic before tightening the enforced policy | N/A (monitoring, not a pass/fail gate) | zero CI cost, ongoing monitoring cost | — |

## Tier 3 — deep scans, real setup cost, run less often (nightly/pre-release)

| # | Tool | Config / npm script | Catches | FP risk | CI cost | Reference impl |
|---|---|---|---|---|---|---|
| 15 | **OWASP ZAP baseline scan** (passive only — never active-scan a production target) | `zap-baseline.py -t $STAGING_URL -c zap-baseline.conf -J report.json` | Missing security headers (CSP/HSTS/X-Frame-Options), reflected/stored XSS visible in passive traffic, CSRF token absence | Low-medium for HIGH-tier rules (XSS/SQLi/CSRF); expect noise on MEDIUM (header-hygiene) on a fresh project — start those as `WARN`, never a silent skip | ~5min (hard-capped) | — |
| 16 | **Trivy filesystem scan** | `trivy fs --severity CRITICAL,HIGH .` + a `.trivyignore` with mandatory CVE/reason/reviewed-date/expiry-date fields (max 90-day expiry) | CVEs in dependencies and container base images, exposed secrets in filesystem | Medium (reachability isn't checked — a CVE in an unreachable code path still flags; the ignore-file discipline is what keeps this honest) | ~10-30s | — |
| 17 | **CSP enforced (after report-only burn-in)** | `Content-Security-Policy` header, enforced | Blocks the XSS classes CSP covers, in production, not just in reports | Low once burned in via report-only first | zero CI cost | — |
| 18 | **Trusted Types enforced** (`require-trusted-types-for 'script'`) | CSP directive + `trustedTypes.createPolicy()` at every dangerous-sink call site | Any remaining direct-string-to-`innerHTML`/`eval` assignment, including from a compromised third-party script | Low, but requires auditing every existing sink first (one-time migration cost, not ongoing FP risk) | zero CI cost once migrated | — |

@es Los tres tiers, en prosa: **Tier 1** son 8 chequeos estáticos (gitleaks, `eslint-plugin-security`,
a11y de plantillas/JSX, `npm audit`/osv-scanner, TS `strict`, validación de HTML, validación
estructural de robots.txt/sitemap.xml, validación de JSON-LD) — todos en segundos, sin app corriendo.
**Tier 2** son 6 chequeos que SÍ necesitan una app corriendo o red (Semgrep con reglas oficiales del
registro, axe vía Playwright, presupuestos de Lighthouse CI, presupuestos de tamaño de bundle,
regresión visual con Playwright, y el rollout de CSP en modo report-only). **Tier 3** son 4 escaneos
profundos para cuando la app maneja datos reales (ZAP baseline pasivo, Trivy sobre el sistema de
ficheros, CSP forzado tras el burn-in, y Trusted Types forzado). Ver las tablas en inglés arriba para
el comando y la configuración exactos de cada entrada — son artefactos técnicos (nombres de
herramienta, comandos, flags), no prosa a traducir.

## Exact configs for the highest-value entries / Configs exactas de las entradas de mayor valor

### 2. ESLint security plugin (flat config)

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

Extends the default ruleset, adds provider-specific rules (adapt the provider list to the actual stack
in use), raises entropy threshold from 3.0→3.5 to cut false positives on base64/hashes/UUIDs. The
`[allowlist]` below is the ONLY exception surface, and every path in it must be a genuinely inert
location (examples, spec fixtures, vendored code) — never a live secret waiting to be excluded:

```toml
[extend]
useDefault = true

[[rules]]
id = "generic-api-key"
entropy = 3.5

[allowlist]
paths = ['''\.env\.example''', '''.*\.spec\.ts$''', '''node_modules/.*''']
```
Entropy is set on the rule: an `[extend.entropy]` table is accepted by gitleaks without error and does
nothing (measured with gitleaks 8.30.1). The copyable version, with a reason above every allowlist entry,
is `templates/gitlab-ci-quality/.gitleaks.toml`; the whole CI stage is described in `gitlab-ci-quality.md`.
@es La entropía se fija en la regla: gitleaks acepta una tabla `[extend.entropy]` sin error y no hace nada
(medido con gitleaks 8.30.1). La versión copiable, con un motivo sobre cada entrada de la lista de
permitidos, es `templates/gitlab-ci-quality/.gitleaks.toml`; la etapa de CI completa está en
`gitlab-ci-quality.md`.
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
regex escape hatch) as a substitute for a proper AST pattern; if a custom rule is needed (e.g. banning
a specific unsafe API call), write it as `pattern-either:` with real code shapes, the way Semgrep's own
registry rules do.

### 15. OWASP ZAP baseline — passive-only, safe defaults

Rule IDs per [zaproxy.org/docs/alerts](https://www.zaproxy.org/docs/alerts/):
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
