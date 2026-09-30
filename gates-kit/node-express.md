# Node / Express Gates

Node/Express-specific additions on top of `tier1-tier3-menu.md`, which already covers the
framework-agnostic half (`eslint-plugin-security`, gitleaks, `npm audit`/osv-scanner, Semgrep, ZAP,
Trivy). This file covers what is specific to a server that terminates HTTP, talks to a database, and
issues its own auth tokens.

@es Añadidos específicos de Node/Express sobre `tier1-tier3-menu.md`, que ya cubre la mitad agnóstica
de framework. Este fichero cubre lo específico de un servidor que termina HTTP, habla con una base de
datos, y emite sus propios tokens de auth.

## 1. Validation at every boundary

Every value crossing a trust boundary — route params, query string, request body, headers the app
reads for logic (not just proxies), env vars parsed into numbers/URLs — is validated by a real
schema/parser library, never by hand-rolled `if` checks that silently miss a case:

```js
// Zod example — Joi (class-validator for Nest, express-validator) are equally acceptable
const CreateProjectSchema = z.object({
  projectName: z.string().min(1).max(200),
  page: z.coerce.number().int().min(1).default(1),
});
app.post('/api/project', (req, res, next) => {
  const parsed = CreateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 400, message: parsed.error.message });
  }
  // ...use parsed.data, never req.body directly past this point
});
```

**Catches**: type-confusion bugs (a route handler that does `parseInt(req.params.id)` and silently
gets `NaN` past a later check), mass-assignment (`Object.assign(query, req.body.parameters)` merging
attacker-controlled keys straight into a DB query — the pattern the schema's `.strict()`/whitelist mode
exists to close), and the classic "worked in the happy path, 500'd on a malformed request" class of
bug. **This is a code-review/architecture discipline more than an automatable lint rule** — the nearest
automatable proxy is `eslint-plugin-security`'s `detect-object-injection` (Tier 1 #2) plus a
project-specific ESLint rule banning direct `req.body`/`req.query` property access outside a validation
layer, if the codebase is consistent enough to support one.

@es Todo valor que cruza un límite de confianza se valida con una librería real de schema/parser, nunca
con `if` a mano que se olvida un caso en silencio (ver ejemplo arriba). **Detecta**: bugs de confusión
de tipo, mass-assignment (fusionar claves controladas por el atacante directo en una query de BD), y la
clase clásica de bug "funcionó en el camino feliz, 500 en una petición malformada". Es más una
disciplina de revisión/arquitectura que una regla de lint automatizable — el proxy automatizable más
cercano es `detect-object-injection` de `eslint-plugin-security` (Tier 1 #2) más una regla de ESLint
propia del proyecto que prohíba el acceso directo a propiedades de `req.body`/`req.query` fuera de una
capa de validación, si el código es lo bastante consistente para soportarla.

## 2. Parameterized database access, always

MongoDB/Mongoose: never build a query object from unvalidated, unwhitelisted request input merged
wholesale (`Object.assign(query, req.body.parameters)` is the anti-pattern — an attacker can inject
Mongo operators like `$where`/`$regex`/`$gt` if the merged value reaches the driver unfiltered).
SQL (any driver): parameterized queries / a query builder / an ORM — string-concatenated SQL is banned
outright, no exception. Enforce with:

```js
// eslint-plugin-security already catches literal eval/child_process; for NoSQL-injection shape,
// a project-specific rule or Semgrep custom pattern (p/nodejsscan has starter rules for
// Mongo operator injection) is the closest automatable proxy — code review closes the rest.
```

@es MongoDB/Mongoose: nunca construir un objeto de query fusionando entrada de request sin validar/sin
whitelist completa (`Object.assign(query, req.body.parameters)` es el antipatrón — un atacante puede
inyectar operadores Mongo como `$where`/`$regex`/`$gt` si el valor fusionado llega al driver sin
filtrar). SQL: siempre parametrizado / query builder / ORM — SQL concatenado por string está prohibido
sin excepción.

## 3. Secrets: never in code, never in logs

- No literal credential, connection string, or API key in source — enforced by gitleaks (Tier 1 #1).
  A `config/*.json` file checked into a repo is a common miss: gitleaks scans it like any other text
  file, but a project should also structurally separate "safe to commit" shape-only config
  (`config_example.json`-style, values redacted/placeholder) from real per-environment values, which
  belong in `.env`/a secrets manager, never in a tracked file.
- **No secret, token, or password in a `console.log`/logger call, ever** — including a debug line meant
  to be temporary (`console.log("password:", password)` in a one-off script is exactly this class of
  leak, and it survives in shell history / CI logs / log aggregators long after the script is deleted).
  A lint rule cannot reliably catch this (it needs to know which variable holds a secret); the control
  is a review discipline plus never writing such a line even for local debugging — reach for a debugger
  breakpoint instead.
- A one-off admin/seed/reset script that must take a password does so via an interactive prompt or an
  env var read at invocation time, never a literal hardcoded value committed alongside the script.

@es Ningún credential literal en el código fuente (gitleaks lo cubre). Un `config/*.json` versionado es
un fallo común: separar estructuralmente la config de forma/ejemplo (valores placeholder) de los
valores reales por entorno, que van en `.env`/un gestor de secretos, nunca en un fichero versionado.
**Ningún secreto en un `console.log`/logger, nunca** — ni siquiera una línea de debug "temporal": eso
sobrevive en el historial de shell / logs de CI mucho después de borrar el script. Un script de
admin/seed/reset de un solo uso toma la contraseña por prompt interactivo o variable de entorno leída
al invocarse, nunca un valor literal hardcodeado junto al script.

## 4. Security headers, CORS, rate limiting

```js
import helmet from 'helmet';
app.use(helmet()); // sets a safe baseline: X-Content-Type-Options, X-Frame-Options, HSTS, etc.
app.use(cors({ origin: process.env.FRT_URL, credentials: true })); // an explicit allowlist, never `*` with credentials
```
Rate limiting on auth endpoints specifically (login, password reset) — see `tier1-tier3-menu.md` #15's
ZAP rule `10202`/`40012` class of finding, and a project's own throttler (Express: `express-rate-limit`
or an equivalent) scoped tighter on `/login`/`/auth` than on read endpoints.

**Password hashing**: bcrypt or argon2, never a hand-rolled scheme. If a legacy system used a weaker
scheme (e.g. raw PBKDF2 with a fixed iteration count set years ago), migrating forward means verifying
against the OLD scheme on login and re-hashing with the NEW one on success — never silently
re-implementing the old scheme in new code as if it were still the target.

@es `helmet()` para una línea base segura de cabeceras; CORS con allowlist explícita, nunca `*` con
`credentials`. Rate limiting específico en endpoints de auth (login, reset de contraseña). **Hash de
contraseñas**: bcrypt o argon2, nunca un esquema hecho a mano. Si un sistema legacy usaba un esquema
más débil, migrar hacia delante significa verificar contra el esquema VIEJO al loguear y re-hashear con
el NUEVO al tener éxito — nunca reimplementar el esquema viejo en código nuevo como si siguiera siendo
el objetivo.

## 5. Lint baseline for plain Node/Express (no framework CLI)

```js
import js from '@eslint/js';
import securityPlugin from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  { plugins: { security: securityPlugin }, rules: { /* see tier1-tier3-menu.md #2 */ } },
  { languageOptions: { globals: { process: 'readonly', require: 'readonly', module: 'writable' } } },
];
```
A project with **no lint configured at all** starts here — `eslint.configs.recommended` plus the
security plugin is the day-one floor, landed per the no-hidden-failures rollout discipline (zero
offenders, or registered-not-enabled).

@es Un proyecto **sin ningún lint configurado** empieza aquí — `eslint.configs.recommended` más el
plugin de seguridad es el piso del día uno, desplegado con la misma disciplina de cero infractores.
