# Gates Kit — Executable Quality Gates for Angular, React and Node/Express Projects

A menu of **tool-based, parser/AST-based, or official-scanner-based** quality gates a project can
adopt. Every entry executes a real tool against real output — none of it is a regex-over-source-text
pipeline (`~/.claude/rules/00-owner-mandates.md`: "grep localiza, NO dictamina" — a search locates
candidates, it never renders a verdict). This is a **reference kit**, not a project: nothing here runs
automatically. A project copies the config it needs into its own tree and wires it into its own
scripts/CI.

@es Un menú de quality gates **basados en herramienta, parser/AST, u official-scanner** que un
proyecto puede adoptar. Cada entrada ejecuta una herramienta real sobre una salida real — nada de esto
es una tubería de regex sobre texto fuente (`~/.claude/rules/00-owner-mandates.md`: "grep localiza, NO
dictamina"). Es un **kit de referencia**, no un proyecto: nada de aquí corre solo. Un proyecto copia la
config que necesita a su propio árbol y la conecta a sus propios scripts/CI.

## Files in this kit / Ficheros de este kit

| File | What it owns |
|---|---|
| `tier1-tier3-menu.md` | The ranked, framework-agnostic gate menu (secrets, security lint, a11y, CVEs, TS strictness, HTML/sitemap/JSON-LD validation, Semgrep, axe, Lighthouse, bundle budgets, visual regression, CSP, ZAP, Trivy, Trusted Types) with exact configs for the highest-value entries |
| `angular.md` | Angular-specific gates: `@angular-eslint` (including template a11y), `strictTemplates`, harness-based testing conventions, OnPush/signals lint |
| `react.md` | React-specific gates: `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react-hooks`, Next.js pointer |
| `node-express.md` | Node/Express-specific gates: boundary validation, parameterized DB access, secrets hygiene, security headers/rate limiting |
| `fleet-kit-integration.md` | How a gate rolls out through `~/.claude/fleet-kit/` without ever going green by hiding a failure |
| `gaps-manual-checklists.md` | Where no tool exists and a checklist (already in `~/.claude/checklists/`) is the only control |
| `angular/`, `nest/`, `node-vitest/` | The executable gates of each stack: one folder per gate with its config, `pass/` and `fail/` fixtures, `SOURCE.md` and `gate.json` (the command). `verify.mjs` proves each one goes green on `pass/` and red on `fail/` |
| `toolchains/<stack>/`, `toolchains/<stack>-<major>/` | The pinned packages a stack's gates run on: a private `package.json` with exact versions and its `package-lock.json`. Angular has one per major (`angular-19` ... `angular-22`: that major's TypeScript, angular-eslint, ESLint and both runners it supports); Nest and Node one each. Install once outside every repository and point `GATES_KIT_TOOLCHAIN` at it; verify a per-major one with `verify.mjs --toolchain <id>` |
| `toolchain-for.mjs` | `toolchainFor(profile, hostNode)`: the toolchain id a project's REAL framework major and test runner need, or a stated refusal (unsupported major or runner, host Node outside the range); never a near toolchain |
| `node-range.mjs` | Reads an `engines.node` range against a Node version (throws on what it cannot read) |
| `angular-lint-rules.mjs` | The angular-eslint rules on per Angular major (`no-experimental`, `no-developer-preview`, `prefer-*` from the major whose guidance asks for them), used by `angular/angular-eslint-rules` |
| `gate-command-rules.mjs` | Every gate command names its reporter (ESLint `--format`, `tsc --pretty false`, Vitest `--reporter`, Jest/Karma/Stryker `--reporters`, dependency-cruiser `--output-type`) so a log reader sees a stable report, and never passes `eslint --quiet` |
| `run-tool.mjs` | The launcher every gate runs its package through: finds the binary under `GATES_KIT_TOOLCHAIN`, exits 3 rather than pass when it cannot |
| `findings-register.mjs` | The per-repository findings register (`.claude/FINDINGS.jsonl`): append-only findings and closures with receipts; `list`, `validate`, `add`, `close`. Every `templates/<stack>/AGENT-CONTRACT.md` names its path |

@es
| Fichero | Qué contiene |
|---|---|
| `tier1-tier3-menu.md` | El menú de gates agnóstico de framework, con configs exactas para las entradas de mayor valor |
| `angular.md` | Gates específicos de Angular (`@angular-eslint`, a11y de plantillas, `strictTemplates`, harnesses, OnPush/signals) |
| `react.md` | Gates específicos de React (`eslint-plugin-react`, `jsx-a11y`, `react-hooks`, puntero a Next.js) |
| `node-express.md` | Gates específicos de Node/Express (validación en el borde, acceso a BD parametrizado, higiene de secretos, cabeceras/rate limiting) |
| `fleet-kit-integration.md` | Cómo se despliega un gate a través de `~/.claude/fleet-kit/` sin esconder nunca un fallo |
| `gaps-manual-checklists.md` | Dónde no existe herramienta y un checklist (ya en `~/.claude/checklists/`) es el único control |
| `angular/`, `nest/`, `node-vitest/` | Los gates ejecutables de cada stack: una carpeta por gate con su config, fixtures `pass/` y `fail/`, `SOURCE.md` y `gate.json` (el comando). `verify.mjs` prueba que cada uno sale en verde sobre `pass/` y en rojo sobre `fail/` |
| `toolchains/<stack>/`, `toolchains/<stack>-<major>/` | Los paquetes fijados sobre los que corren los gates de un stack: un `package.json` privado con versiones exactas y su `package-lock.json`. Angular tiene una por major (`angular-19` ... `angular-22`); Nest y Node una cada uno. Se instala una vez fuera de todo repositorio y `GATES_KIT_TOOLCHAIN` apunta a él; una por major se verifica con `verify.mjs --toolchain <id>` |
| `toolchain-for.mjs` | `toolchainFor(profile, hostNode)`: el id de toolchain que piden la major REAL y el runner de tests del proyecto, o un rechazo explícito; nunca una toolchain cercana |
| `node-range.mjs` | Lee un rango `engines.node` frente a una versión de Node (lanza ante lo que no puede leer) |
| `angular-lint-rules.mjs` | Las reglas de angular-eslint activas por major de Angular, usadas por `angular/angular-eslint-rules` |
| `gate-command-rules.mjs` | Todo comando de gate nombra su reporter, para que un lector de logs vea un informe estable, y nunca pasa `eslint --quiet` |
| `run-tool.mjs` | El lanzador por el que cada gate corre su paquete: busca el binario bajo `GATES_KIT_TOOLCHAIN` y sale con 3 en vez de pasar si no puede |
| `findings-register.mjs` | El registro de hallazgos por repositorio (`.claude/FINDINGS.jsonl`): hallazgos y cierres con recibos, solo se añade; `list`, `validate`, `add`, `close`. Cada `templates/<stack>/AGENT-CONTRACT.md` nombra su ruta |

## No hidden failures, through any channel (owner directive 2026-09-30, absolute)

Owner, verbatim: «NO SE ESCONDEN FALLOS, SE ABORDAN y bien abordados.» This governs how **every** gate
in this kit is rolled into a real project — the config alone is not the gate; the rollout discipline
is part of it:

- A **new** gate lands with **zero offenders**. Its violations are fixed at the root first, or the
  rule stays registered but **not enabled** until they are. Never seed a baseline to make it green.
- **No central exception registry may be created or grow**: bulk-suppression files, lint/tool ignore
  lists, ratchet baselines, opt-out lists, coverage exclusions, `knip`/dependency-check ignores,
  skipped or `.only` tests, coverage-ignore comments, a rule flipped to `off`. Existing registries only
  **shrink**. (This is why `.gitleaks.toml`'s `[allowlist]`, `npm audit`'s ignore list, and a
  `.trivyignore` in this kit each carry a mandatory reason + expiry field below — an exception without
  an expiry is exactly the registry this rule forbids.)
- Each violation a gate finds is a possible defect to investigate, never an entry to file away.
- If a violation genuinely cannot be fixed without a regression, that is reported with evidence — never
  silently routed around.

@es Directiva del dueño, verbatim: «NO SE ESCONDEN FALLOS, SE ABORDAN y bien abordados.» Esto rige
CÓMO se instala cada gate de este kit en un proyecto real:
- Un gate **nuevo** entra con **cero infractores**. Sus violaciones se arreglan en la raíz primero, o
  la regla queda registrada pero **sin activar** hasta que lo estén. Nunca sembrar una línea base para
  que salga verde.
- **Ningún registro central de excepciones puede crearse o crecer**: ficheros de supresión masiva,
  listas de ignorados de lint/herramienta, líneas base de ratchet, listas de opt-out, exclusiones de
  cobertura, ignorados de `knip`/chequeo de dependencias, tests saltados o `.only`, comentarios de
  ignorar cobertura, una regla apagada a `off`. Los registros existentes solo **encogen**. (Por eso el
  `[allowlist]` de `.gitleaks.toml`, la lista de ignorados de `npm audit` y un `.trivyignore` de este
  kit llevan más abajo un motivo + fecha de caducidad obligatorios — una excepción sin caducidad es
  exactamente el registro que esta regla prohíbe.)
- Cada violación que un gate encuentra es un posible defecto a investigar, nunca una entrada para
  archivar.
- Si una violación genuinamente no puede arreglarse sin una regresión, eso se reporta con evidencia —
  nunca se rodea en silencio.

## Bilingual, including runtime messages (owner directive 2026-09-30)

Owner, verbatim: «TODO BILINGÜE, TODO LO DEL CÓDIGO YA SE CONSOLE.LOG, JSDOC TODO BILINGÜE, COMO
REGLA.» Every gate config example in this kit that emits a message a human reads — a lint rule's custom
message, a validation-error string, a script's console output — is written **English first, then the
same message's Spanish half marked `@es`**, never one language only and never a translation replacing
the other language's line. This kit's own files follow that convention throughout.

@es Directiva del dueño, verbatim: «TODO BILINGÜE, TODO LO DEL CÓDIGO YA SE CONSOLE.LOG, JSDOC TODO
BILINGÜE, COMO REGLA.» Todo ejemplo de config de gate en este kit que emite un mensaje que una persona
lee — el mensaje propio de una regla de lint, un string de error de validación, la salida de un script
— se escribe **primero en inglés, y luego la mitad en español del mismo mensaje marcada `@es`**, nunca
en un solo idioma y nunca traduciendo en vez de completar. Los propios ficheros de este kit siguen esta
convención en todas partes.

## How a project adopts this kit

1. Read `tier1-tier3-menu.md` and pick Tier 1 entries first (cheap, low false-positive, no running app
   needed).
2. Read the stack file(s) that apply (`angular.md`, `react.md`, `node-express.md` — a full-stack repo
   reads more than one).
3. Copy the exact config shown into the project's own tree (`eslint.config.*`, `.gitleaks.toml`,
   `.lighthouserc.cjs`, etc.) — never reference this kit's files from a project's runtime config.
4. Roll the gate out per `fleet-kit-integration.md` and the no-hidden-failures rule above.
5. Where no tool exists (`gaps-manual-checklists.md`), the checklist is the control — not a future gate
   to build.

@es
1. Leer `tier1-tier3-menu.md` y elegir primero las entradas de Tier 1.
2. Leer el/los ficheros de stack que apliquen (`angular.md`, `react.md`, `node-express.md`).
3. Copiar la config exacta al propio árbol del proyecto — nunca referenciar los ficheros de este kit
   desde la config en tiempo de ejecución de un proyecto.
4. Desplegar el gate según `fleet-kit-integration.md` y la regla de no esconder fallos de arriba.
5. Donde no existe herramienta (`gaps-manual-checklists.md`), el checklist ES el control — no un gate
   pendiente de construir.

## Provenance note / Nota de procedencia

Content in this kit derived from `adrii-docs` (the owner's personal, separate reference repo) is
explicitly re-attributed at point of use rather than silently reused: the ESLint security config,
gitleaks config, and ZAP baseline config are reused close to verbatim (tool configs, not
code-structure regex); the ASVS-L2 manual checklist and SEO skill content are adapted and re-verified
against current primary sources rather than copied. `adrii-docs`'s own
`scripts/run-audit.sh`/`audit-full.sh` orchestration layer (379 grep/regex invocations) was read and
explicitly **not** reused — it violates the no-regex mandate this kit is built to honor.

@es El contenido de este kit derivado de `adrii-docs` (repo personal y separado del dueño) se
re-atribuye explícitamente en el punto de uso en vez de reusarse en silencio: la config de ESLint de
seguridad, la de gitleaks y la línea base de ZAP se reusan casi verbatim (configs de herramienta, no
regex de estructura de código); el checklist manual ASVS-L2 y el contenido de la skill SEO se adaptan
y re-verifican contra fuentes primarias actuales en vez de copiarse. La capa de orquestación propia de
`adrii-docs` (`scripts/run-audit.sh`/`audit-full.sh`, 379 invocaciones grep/regex) se leyó y
explícitamente **no** se reusó — viola el mandato anti-regex que este kit existe para honrar.
