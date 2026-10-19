# Clean-code gate profile — the one list every project adopts

One profile, one checker. `profile.mjs` is the machine-readable list of gates (tool, exact config, threshold,
why); `check.mjs <project root>` reports, per gate, whether the project has it **enforced** on its landing path,
**configured-only** or **absent**, each verdict with the evidence that decided it. A threshold changes in
`profile.mjs` and nowhere else. The gates that already exist as executable gates in this kit
(`angular/dependency-cruiser-circular`, `angular/dependency-cruiser-layering`, `angular/ts-strict-type-checked`)
are used as they are; this profile adds no second dependency-cruiser gate.

@es Un perfil, un checker. `profile.mjs` es la lista legible por máquina de los gates (herramienta, config exacta,
umbral, porqué); `check.mjs <raíz del proyecto>` informa, por gate, si el proyecto lo tiene **aplicado** en su
camino de aterrizaje, **solo configurado** o **ausente**, cada veredicto con la evidencia que lo decidió. Un
umbral cambia en `profile.mjs` y en ningún otro sitio. Los gates que ya existen como gates ejecutables en este
kit (`angular/dependency-cruiser-circular`, `angular/dependency-cruiser-layering`,
`angular/ts-strict-type-checked`) se usan tal cual; este perfil no añade un segundo gate de dependency-cruiser.

## The profile / El perfil

Provenance of each threshold: **MEASURED** a value a tree enforces today (b100-am-ui, file and line), **DEFAULT**
the tool's own default, **DERIVED** computed from a measured value with its offenders not yet counted (a design
decision until adoption step 2 has counted them).

| Gate id | Stacks | Tool | Threshold | Why |
|---|---|---|---|---|
| `lint-on-landing` | angular, node | ESLint (`eslint`, `ng lint`) | a lint command reached by the landing path | A rule nobody runs is not a gate. MEASURED: Discovery-FE lints in `build:ci` but its landing suite excludes lint |
| `complexity` | angular, node | ESLint `complexity` | max 13 | MEASURED b100-am-ui `eslint.config.ts:359`; ESLint default 20 |
| `max-depth` | angular, node | ESLint `max-depth` | max 4 | MEASURED `eslint.config.ts:360`; also the ESLint default |
| `max-params` | angular, node | ESLint `max-params` | max 5 | MEASURED `eslint.config.ts:361`; ESLint default 3 |
| `max-lines-per-function` | angular, node | ESLint `max-lines-per-function` | max 100, blank lines and comments skipped | MEASURED `eslint.config.ts:362`; ESLint default 50 |
| `max-lines` | angular, node | ESLint `max-lines` | max 400, blank lines and comments skipped | MEASURED `eslint.config.ts:694`: a longer file does more than one thing |
| `max-statements` | angular, node | ESLint `max-statements` | max 30 | DERIVED: 100 lines per function at about 3 lines per statement is about 33, rounded down. No tree enforces it yet |
| `cognitive-complexity` | angular, node | `sonarjs/cognitive-complexity` (`eslint-plugin-sonarjs`) | 15 | DEFAULT of the rule; b100-am-ui enables the sonarjs recommended preset (`eslint.config.ts:125`) |
| `template-complexity` | angular | `@angular-eslint/template/cyclomatic-complexity` | maxComplexity 10 | MEASURED `eslint.config.ts:1347`; rule default 5 |
| `security-lint` | angular, node | `eslint-plugin-security` | the 10 rules of the kit menu entry 2 at `error` | The 3 rules the menu sets to `warn` are not graded: a warning that does not fail is a hidden failure |
| `strict-typescript` | angular | `tsc` (`strict: true`) | strict, and a type-checking command on the path | Floor under every type-based rule; the kit gate `angular/ts-strict-type-checked` adds typed lint |
| `circular-dependencies` | angular, node | dependency-cruiser | zero cycles, rule at `error` | Kit gate `angular/dependency-cruiser-circular` is the config |
| `hexagonal-layering` | angular, node | dependency-cruiser | zero violations of the layering rules | Kit gate `angular/dependency-cruiser-layering`: `core` never imports `pages`, `adapters` or `infrastructure`; `domain` never imports `@angular/*` |
| `duplication` | angular, node | `jscpd` | `minTokens` 70, `threshold` 0 | DERIVED: default 50 flags import lists and decorator metadata; 70 is about an 8-line clone. Production code only |
| `dead-code` | angular, node | `knip` | zero issues, zero `ignore*` entries | MEASURED: b100-am-ui runs knip in `ci:lint` (`package.json:45`) |
| `dependency-audit` | angular, node | `npm audit` | `--audit-level=high`, blocking | Kit menu row 4 and `gitlab-ci-quality.md`. A CI job with `allow_failure` does not count |

@es Procedencia de cada umbral: **MEDIDO** un valor que un árbol aplica hoy (b100-am-ui, fichero y línea),
**DEFAULT** el de la herramienta, **DERIVADO** calculado de un valor medido sin haber contado aún sus infractores
(una decisión de diseño hasta que el paso 2 de adopción los cuente).

@es | Gate | Umbral | Porqué |
|---|---|---|
| `lint-on-landing` | un comando de lint alcanzado por el camino de aterrizaje | Una regla que nadie corre no es un gate. MEDIDO: Discovery-FE lintea en `build:ci` pero su suite de aterrizaje excluye el lint |
| `complexity` | max 13 | MEDIDO en b100-am-ui `eslint.config.ts:359`; el default de ESLint es 20 |
| `max-depth` | max 4 | MEDIDO `eslint.config.ts:360`; también el default de ESLint |
| `max-params` | max 5 | MEDIDO `eslint.config.ts:361`; el default de ESLint es 3 |
| `max-lines-per-function` | max 100, sin líneas en blanco ni comentarios | MEDIDO `eslint.config.ts:362`; default de ESLint 50 |
| `max-lines` | max 400, sin líneas en blanco ni comentarios | MEDIDO `eslint.config.ts:694`: un fichero más largo hace más de una cosa |
| `max-statements` | max 30 | DERIVADO: 100 líneas por función a unas 3 líneas por sentencia son unas 33, redondeado. Ningún árbol lo aplica aún |
| `cognitive-complexity` | 15 | DEFAULT de la regla; b100-am-ui activa el preset recommended de sonarjs (`eslint.config.ts:125`) |
| `template-complexity` | maxComplexity 10 | MEDIDO `eslint.config.ts:1347`; default de la regla 5 |
| `security-lint` | las 10 reglas de la entrada 2 del menú en `error` | Las 3 que el menú pone en `warn` no se califican: un aviso que no falla es un fallo escondido |
| `strict-typescript` | strict y un comando que comprueba tipos en el camino | Suelo de toda regla basada en tipos; el gate `angular/ts-strict-type-checked` añade lint con tipos |
| `circular-dependencies` | cero ciclos, regla en `error` | El gate del kit `angular/dependency-cruiser-circular` es la config |
| `hexagonal-layering` | cero violaciones de las reglas de capas | Gate del kit `angular/dependency-cruiser-layering`: `core` no importa `pages`, `adapters` ni `infrastructure`; `domain` no importa `@angular/*` |
| `duplication` | `minTokens` 70, `threshold` 0 | DERIVADO: el default 50 marca listas de imports y metadatos de decoradores; 70 es un clon de unas 8 líneas. Solo código de producción |
| `dead-code` | cero incidencias, cero entradas `ignore*` | MEDIDO: b100-am-ui corre knip en `ci:lint` (`package.json:45`) |
| `dependency-audit` | `--audit-level=high`, bloqueante | Fila 4 del menú del kit y `gitlab-ci-quality.md`. Un job de CI con `allow_failure` no cuenta |

## Exact configuration / Configuración exacta

Copy it into the project's own tree; never reference this kit from a project's runtime config.
@es Cópiese al árbol del propio proyecto; nunca se referencia este kit desde la config en tiempo de ejecución.

`eslint.config.js` (flat config; for the Node stack use `files: ['**/*.mjs']` and drop the template block):

```js
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  {
    files: ['**/*.ts'],
    plugins: { security, sonarjs },
    rules: {
      complexity: ['error', { max: 13 }],
      'max-depth': ['error', { max: 4 }],
      'max-params': ['error', { max: 5 }],
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-statements': ['error', { max: 30 }],
      'sonarjs/cognitive-complexity': ['error', 15],
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',
    },
  },
  {
    files: ['**/*.html'],
    rules: { '@angular-eslint/template/cyclomatic-complexity': ['error', { maxComplexity: 10 }] },
  },
];
```

`.jscpd.json` (production code; specs favour readable repetition and are measured by coverage):

```json
{ "minTokens": 70, "threshold": 0, "path": ["src"], "format": ["typescript", "javascript"] }
```

`knip.json` (declare entries and the project; never an `ignore*` list):

```json
{ "entry": ["src/main.ts"], "project": ["src/**/*.ts"] }
```

`.dependency-cruiser.cjs`: copy `angular/dependency-cruiser-circular/config.cjs` and the three `forbidden`
rules of `angular/dependency-cruiser-layering/config.cjs` into one file; run `depcruise --config
.dependency-cruiser.cjs src`. A project with no `adapters`, `infrastructure` or `domain` folder passes those rules
vacuously, which is the zero-offenders landing.

Audit: `npm audit --audit-level=high`, in a CI job without `allow_failure`, or in the landing chain.

Typescript: `"strict": true` in the `tsconfig.json` the build uses.

## The checker / El checker

```
node gates-kit/clean-code-profile/check.mjs <project root> [--stack angular|node] [--strict]
```

Exit 0 the report was produced; 1 with `--strict` when a gate is not enforced; 2 nothing was measured: bad usage,
a root that is not a directory, or a crash while measuring (reported with its reason, never left to escape as exit
1, which means a strict failure). A `package.json` or `fleet-kit.json` that is present but not valid JSON leaves
every gate `UNMEASURED` with the file as evidence; an invalid `.jscpd.json` leaves only `duplication` unmeasured.
The ignore debt of a `knip.ts`, `knip.js` or `knip.jsonc` is asked to the project's own installed knip (`knip
--debug`, reading its resolved `parsedConfig`; there is no `--print-config`); when knip is not installed, times
out or prints a shape the parser does not know, the evidence says `NOT MEASURED` with the reason, never zero. A
plain `knip.json` is counted directly. It writes no file, but it is not a passive reader: it runs the project's
own installed tools (ESLint, the compiler, and knip, which loads a `knip.ts` or `knip.js` as code and may run for
up to 300 s) and loads a dependency-cruiser config written as code, so it executes the project's code; run it
only on a project you trust. The stack is `angular` when `@angular/core` is a dependency, else `node`.

| Verdict | Meaning |
|---|---|
| `ENFORCED` | the profile's configuration is met AND a command of the tool runs from a root that enforces |
| `CONFIGURED-ONLY` | a trace without both: a weaker limit, a warning, a command reached only from a hook or an allowed-failure CI job, or a config nobody runs |
| `ABSENT` | no trace |
| `UNMEASURED` | the tool that answers (ESLint, the compiler, a config module) could not run; the reason is the evidence |

What it reads, so a verdict can be traced: ESLint is asked with `eslint --print-config` on a sample file (the
evidence names it: the project's root `src/`, a component or service first); the compiler with `tsc
--showConfig`; the dependency-cruiser config is loaded and its own regexes are evaluated against probe paths, so
a rule cannot pass by carrying a name. The landing path is: the `unitSuite.npmScript` of the nearest
`.claude/fleet-kit.json` (root `unit-suite`, the one the landing guard runs), the whole-gate scripts
`build:ci-pr`, `build:ci`, `ci`, `verify` (`integration-script`), the jobs of `.gitlab-ci.yml` without
`allow_failure` (`ci-job`), followed through `npm run`, `pre`/`post` scripts and `run-checks`/`npm-run-all`
aggregators. A husky hook and an allowed-failure job are listed but never enforce. A `(landing guard)` mark means
the unit suite itself reaches the gate.

What it does not do: it does not read the body of a custom script (a project's own `check:acyclic` or
`check:consumer-audit` is not credited as the profile's tool; madge is named as an equivalent, not credited), a
workspace-scoped run (`-w`) is recorded but not followed, YAML anchors and `rules:` conditions of the CI file are
not evaluated, and it samples one source file and one template, so a per-folder override is not seen.

@es Sale con 0 si se produjo el informe, 1 con `--strict` si algún gate no está aplicado, 2 si no se midió nada
(uso erróneo, raíz que no es directorio, o un fallo al medir, informado con su motivo y nunca dejado escapar como
1, que significa fallo estricto). Un `package.json` o `fleet-kit.json` presente pero que no es JSON válido deja
todos los gates `UNMEASURED` con el fichero como evidencia; un `.jscpd.json` inválido deja sin medir solo
`duplication`. La deuda ignore de un `knip.ts`, `knip.js` o `knip.jsonc` se le pregunta al knip instalado del
proyecto (`knip --debug`, leyendo su `parsedConfig` resuelto; no existe `--print-config`); si knip no está
instalado, agota el tiempo o imprime una forma que el parser no conoce, la evidencia dice `NO MEDIDO` con el
motivo, nunca cero. Un `knip.json` simple se cuenta directamente. No escribe ningún fichero, pero no es un
lector pasivo: ejecuta las herramientas instaladas del propio proyecto (ESLint, el compilador y knip, que carga
un `knip.ts` o `knip.js` como código y puede correr hasta 300 s) y carga una config de dependency-cruiser
escrita como código, así que ejecuta código del proyecto; solo debe ejecutarse sobre un proyecto de confianza. **ENFORCED** (aplicado): se cumple la config del perfil Y un comando de la herramienta corre
desde una raíz que aplica. **CONFIGURED-ONLY**: un rastro sin ambos (límite más flojo, un aviso, un comando
alcanzado solo desde un hook o un job con `allow_failure`, o una config que nadie corre). **ABSENT**: ningún
rastro. **UNMEASURED**: la herramienta que responde no pudo correr. A ESLint se le pregunta con `eslint
--print-config` sobre un fichero de muestra (la evidencia lo nombra), al compilador con `tsc --showConfig`, y la
config de dependency-cruiser se carga y se evalúan sus propias regex contra rutas de sonda. El camino de
aterrizaje es el `unitSuite.npmScript` del `.claude/fleet-kit.json` más cercano (raíz `unit-suite`, la que corre el
guard de aterrizaje), los scripts de gate completo (`integration-script`) y los jobs de `.gitlab-ci.yml` sin
`allow_failure` (`ci-job`), seguidos a través de `npm run`, scripts `pre`/`post` y agregadores. Un hook de husky y
un job con `allow_failure` se listan pero nunca aplican. No lee el cuerpo de un script propio, no sigue las
ejecuciones de workspace, no evalúa anclas YAML ni condiciones `rules:`, y muestrea un fichero fuente y una
plantilla, así que un override por carpeta no se ve.

## Adoption guide / Guía de adopción

The rule that governs every step, from the kit README: a gate lands with **zero offenders**. Fix the **code**,
never the rule: no baseline, no `ignore` list, no `eslint-disable`, no rule at `warn` or `off`, no threshold above
the profile. A rule that is genuinely wrong for the domain is changed in `profile.mjs` with a written reason, for
every project at once, never in one project's config.

@es La regla que gobierna cada paso, del README del kit: un gate aterriza con **cero infractores**. Se arregla el
**código**, nunca la regla: ni línea base, ni lista `ignore`, ni `eslint-disable`, ni regla en `warn` u `off`, ni
umbral por encima del perfil. Una regla genuinamente mala para el dominio se cambia en `profile.mjs` con un motivo
escrito, para todos los proyectos a la vez, nunca en la config de uno.

Per gate, in this protocol:

1. **Measure** the offenders without touching the config: `npx eslint --rule "complexity: [error, 13]" src`,
   `npx jscpd src --min-tokens 70 --threshold 0`, `npx knip`, `npx depcruise --config .dependency-cruiser.cjs src`,
   `npm audit --audit-level=high`.
2. **Fix the code** until the count is zero, in work-unit commits with their tests. A pre-existing offender is in
   scope: "not my file" is not a reason to leave it.
3. **Enable** the rule at `error` with the profile's exact value, and **prove it goes red**: add one offender,
   see the gate fail, remove it, see it pass.
4. **Wire it into the landing path**: the script `.claude/fleet-kit.json` names as `unitSuite.npmScript` (or the
   project's landing chain) must reach the command, so the landing guard runs it. A gate that only a developer
   runs by hand, only from a husky hook, or only in a CI job with `allow_failure` is `CONFIGURED-ONLY`, not
   enforced.
5. **Run the checker** and read the gate as `ENFORCED`; `--strict` turns the full profile into a gate of its own
   once every gate is green.

@es Por gate, con este protocolo: (1) **medir** los infractores sin tocar la config; (2) **arreglar el código**
hasta llegar a cero, en commits de unidad de trabajo con sus tests (un infractor previo está en el alcance); (3)
**activar** la regla en `error` con el valor exacto del perfil y **probar que se pone en rojo**: añadir un
infractor, ver que falla, quitarlo, ver que pasa; (4) **conectarlo al camino de aterrizaje**: el script que
`.claude/fleet-kit.json` llama `unitSuite.npmScript` (o la cadena de aterrizaje del proyecto) debe alcanzar el
comando, para que el guard de aterrizaje lo corra; un gate que solo corre a mano, solo desde un hook de husky o
solo en un job de CI con `allow_failure` es `CONFIGURED-ONLY`, no aplicado; (5) **correr el checker** y leer el
gate como `ENFORCED`; `--strict` convierte el perfil completo en un gate propio cuando todos están en verde.

Order of adoption, cheapest and least noisy first:

1. `lint-on-landing`, then `strict-typescript`: they make every later gate reachable and visible.
2. **Run the checker and measure offenders for every remaining gate** before enabling any: it tells how big each
   step is, and a DERIVED threshold (`max-statements`, `duplication`) is a design decision until its offenders are
   counted. If a count shows the threshold is wrong for the domain, change it in `profile.mjs` with the evidence.
3. `dependency-audit`, `circular-dependencies`, `hexagonal-layering`: mechanical and cheap.
4. `dead-code`, with no `ignore*` entry.
5. The ESLint limits, narrowest change first: `max-depth`, `max-params`, `complexity`, `cognitive-complexity`,
   `template-complexity`, `max-lines-per-function`, `max-lines`, `max-statements`.
6. `security-lint`.
7. `duplication` last: its fixes are refactors that cross files.

@es Orden de adopción, de lo más barato y menos ruidoso a lo más costoso: (1) `lint-on-landing` y luego
`strict-typescript`; (2) correr el checker y medir los infractores de cada gate restante antes de activar
ninguno (un umbral DERIVADO es una decisión de diseño hasta contar sus infractores; si el recuento muestra que es
malo para el dominio se cambia en `profile.mjs` con la evidencia); (3) `dependency-audit`,
`circular-dependencies`, `hexagonal-layering`; (4) `dead-code` sin entradas `ignore*`; (5) los límites de ESLint,
el cambio más estrecho primero; (6) `security-lint`; (7) `duplication` al final, porque sus arreglos son
refactors que cruzan ficheros.

## Measured on 2026-10-12 / Medido el 2026-10-12

`node check.mjs` over the three trees, read-only. b100-am-ui: 10 enforced, 1 configured-only (`dependency-audit`:
its `audit` job has `allow_failure: true`; its blocking audit is the custom script `check:consumer-audit`, which
the checker does not read), 5 absent (`max-statements`, `security-lint`, `circular-dependencies` with madge named,
`hexagonal-layering`, `duplication`). Discovery-FE: 2 enforced (`lint-on-landing` through `build:ci-pr`, and
`strict-typescript` through `ng build`), 14 absent, among them every ESLint limit on the sampled file.
`~/.claude`: no landing root and no ESLint config, so all 14 gates of the Node stack are absent. The reports are
reproducible with the command above; this paragraph is a dated reading, not a contract.

@es `node check.mjs` sobre los tres árboles, solo lectura. b100-am-ui: 10 aplicados, 1 solo configurado
(`dependency-audit`: su job `audit` tiene `allow_failure: true`; su auditoría bloqueante es el script propio
`check:consumer-audit`, que el checker no lee), 5 ausentes. Discovery-FE: 2 aplicados, 14 ausentes. `~/.claude`:
ninguna raíz de aterrizaje ni config de ESLint, los 14 gates del stack Node ausentes. Los informes se reproducen
con el comando de arriba; este párrafo es una lectura fechada, no un contrato.
