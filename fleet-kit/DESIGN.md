# fleet-kit — portable fleet guards with per-repo configuration

Owner directive, 2026-09-30: port to the discovery repositories, deliberately, the fleet mechanisms that
are valid in every project, packaged as GENERIC tooling with per-repo config, never copied by hand.

The kit lives once, in `~/.claude/fleet-kit/`. A repository opts in with two local, git-excluded files:
`<project>/.claude/fleet-kit.json` (what the repository IS) and `<project>/.claude/settings.local.json`
(which kit hooks run). Nothing in any repository's tracked tree is read for configuration or written.

## 1. What was measured before designing (2026-09-30)

| Fact | di_1700002_discovery_fe | legacy discovery-api |
|---|---|---|
| Git top level | the repo root; the npm workspace is `Discovery-FE/` | `insight_web - copia/di_1700002_insight_web`; the project is the subfolder `fuentes/discovery-api/` |
| Integration branch | `develop` — `origin/develop`'s tip is `Merge branch 'feature/sonar-passed' into 'develop'` (merge requests target it); `origin/HEAD` is `main` | `develop` — `origin/HEAD -> origin/develop` |
| Working tree | 418 porcelain entries, 300 of them tracked-modified (someone's in-progress work) | 0 dirty entries |
| Unit test runner | Karma + Jasmine through `@angular-devkit/build-angular:karma` 19.2.22; `test:all` = `build-library` + `test:lib` + `test:app` | **none**: `package.json` scripts are `start*` only, devDependencies are grunt/obfuscator only, zero `*.spec.js`/`*.test.js` outside a vendored bower component |
| Coverage report | library target: its `karmaConfig` (`projects/b100-am-ui/karma.conf.cjs`) emits `lcovonly` into `coverage/b100-am-ui/`; **app target: `angular.json` names no `karmaConfig`, so Angular's built-in config runs, and it emits only `html` + `text-summary` — no lcov at all**. The tracked `Discovery-FE/karma.conf.{js,cjs}` are partial configs (launchers + coverageReporter, no frameworks/plugins) that nothing references | none |
| Coverage exclusions | `angular.json` `codeCoverageExclude`: app `src/testing/**`, `src/app/core/constants/**`, `src/app/core/models/**`, `src/app/app.config.ts`; library `**/*.stories.ts`, `**/b100-compiled-brands.ts` | — |
| lcov `SF:` paths | workspace-relative with backslashes (`SF:projects\b100-am-ui\src\lib\...`) | — |
| Hooks | husky commit-msg / pre-commit / pre-push; none guards the integration branch | none |

The coordinator's first target, `Projects/discovery-api` (NestJS 11 + Jest 30), was measured and then
dropped on the owner's correction: the intended repository is the legacy Express backend. Nothing was
written to `Projects/discovery-api`.

## 2. Mechanisms: what is portable, what stays behind

Portable means: the QUESTION the mechanism answers exists in every repository, and every b100 constant it
depends on can be expressed as configuration.

| Mechanism (b100 reference) | Verdict | Kit form |
|---|---|---|
| `hook-dispatch/` | Portable, and already global (`~/.claude/hook-dispatch/`) | **Reused, not rebuilt.** Kit guards export `evaluate(raw)`; kit manifests list them |
| `shell-command/` + `cherry-pick-guard/working-directory.mjs` (shell tokenizer, git invocation grammar) | Portable verbatim | **Vendored byte-identical** (see §5) |
| `diff-coverage/lib/{diff-parse,lcov-parse,grade}.mjs` | Portable verbatim (pure: diff text, lcov text, grading) | **Vendored byte-identical** |
| `diff-coverage/` runner, classifier, completeness | b100-specific (vitest projects, `src/lib`, `scripts/test/test.ts`, EMFILE census) | **Rewritten** around config: a runner adapter per test framework (Karma today) |
| `agent-liveness/liveness.mjs` + `brief-tenancy/tenancy-declaration.mjs` | Portable verbatim (reads the harness's own `~/.claude/projects/*/*/subagents/*.meta.json`, repo-agnostic) | **Vendored byte-identical** |
| `mutation-proof/run-mutants.mjs` | Portable verbatim | **Vendored byte-identical**; every kit mechanism's mutants run through it |
| `gate-run/` | The question is portable ("which tree did a complete, green unit-suite run grade?"); the b100 form is bound to `build:ci-pr` gate expansion and `integrate/` | **Rewritten, smaller**: records one configured unit-suite command per CLEAN tree |
| `ungated-landing-guard/` | The floor is portable (refuse moving the integration branch to a tree with no green unit-suite verdict); the FULL-chain half, derived-artifact bookkeeping (D-14) and `B100_LANDING_GUARD` are b100 policy | **Rewritten**: floor only; branch names and mode from config; covers `commit`/`cherry-pick` too, because no husky integration-branch guard exists in these repos |
| `worktree-tenancy/` | Portable | **Rewritten** on the vendored tokenizer (the reference only sees `git -C <path>`), exempting the owning agent itself |
| `orphan-work-guard/` | Portable question; the reference's work predicate (`worktree-work/`) encodes b100's ignored-deliverable declarations | **Rewritten** with a plain predicate: porcelain entries, or commits `git cherry` finds missing from the integration branch |
| `fleet-env/handback.mjs` | Portable question; the reference binds `delivery.mjs` (b100 reaper states) and `develop` | **Rewritten**: uncommitted work refuses a handback; then diff coverage of the worker's branch refuses uncovered changed lines |
| `provision-agent-worktrees.mjs`, `fleet-env/` provisioning, `toolchain-guard/` | Portable in principle, **not built now**: the junction farm is tied to b100's single-`node_modules` layout; the FE workspace-in-a-subfolder layout needs its own design | Stated gap (see §6: without it, coverage cannot run inside an agent worktree) |
| `integrate/`, `cherry-pick-guard/`, `ungated-commit-guard/`, `gate-run` chain expansion, `agent-contract/`, `prettier-on-edit/`, `stash-watch/`, `task-ledger/` | b100-specific | Stay behind: they encode b100's gate chain, derived-artifact registry, contract files, or formatting policy |
| eval-guard, brief-provenance, claim guard, failure-capture | Already global in `~/.claude` | Not duplicated |

## 3. Configuration schema (`<project>/.claude/fleet-kit.json`)

Every mechanism section is either its settings or `{ "enabled": false, "reason": "<why, ≥ 20 chars>" }`.
A disabled section MUST say why: silence reads as coverage. Unknown keys are refused, so a typo cannot
silently disable a guard. Paths are repository-relative with `/`, because `git diff` paths are.

```jsonc
{
  "schemaVersion": 1,
  "integrationBranches": ["develop"],          // branches whose moves the landing guard grades
  "worktreeRoot": ".claude/worktrees",         // relative to the git top level; where agent worktrees live
  "unitSuite": {                                // the command a landing verdict must come from
    "npmScript": "test:all",
    "cwd": "Discovery-FE"                       // relative to the git top level
  },
  "coverage": {
    "runner": "karma",
    "projects": [{
      "name": "app",
      "sourceRoot": "Discovery-FE/src/",       // repo-relative prefix of the graded sources
      "extensions": [".ts"],
      "excludeSuffixes": [".spec.ts", ".d.ts"],
      "excludeSegments": ["/testing/"],
      "karma": {
        "workspace": "Discovery-FE",            // the Angular workspace (cwd of `ng test`)
        "ngProject": "Discovery-FE",
        "baseConfig": "angular-builtin"         // or a workspace-relative karma config file
      }
    }]
  },
  "landingGuard": { "mode": "enforce" },        // "enforce" refuses, "advise" injects context
  "handback": { "coverage": "refuse" }          // "refuse" | "off"
}
```

Filled values, from the measurements in §1:

- **di_1700002_discovery_fe** — `integrationBranches: ["develop"]`; `worktreeRoot: ".claude/worktrees"`;
  `unitSuite: { npmScript: "test:all", cwd: "Discovery-FE" }`; coverage projects `app`
  (`Discovery-FE/src/`, `baseConfig: "angular-builtin"`, `ngProject: "Discovery-FE"`) and `library`
  (`Discovery-FE/projects/b100-am-ui/`, `baseConfig: "projects/b100-am-ui/karma.conf.cjs"`,
  `ngProject: "b100-am-ui"`), both `.ts`, excluding `.spec.ts`, `.d.ts`, `.stories.ts`; landing guard
  `enforce`; handback coverage `refuse`.
- **legacy discovery-api** (config at `fuentes/discovery-api/.claude/fleet-kit.json`) —
  `integrationBranches: ["develop"]`; `worktreeRoot: ".claude/worktrees"` (HYPOTHESIS: the harness roots
  agent worktrees at the git top level; not verified for a session started in a subfolder);
  `unitSuite`, `coverage` and `landingGuard` **disabled**, each with its reason (no test runner exists);
  handback coverage `off` for the same reason — its uncommitted-work half still applies.

**Config discovery.** A guard never trusts the payload's `cwd` to be the repository root. From the directory
a command acts in, it asks git for the top level and the common git dir (so a linked worktree maps to its
main checkout), maps the directory to the same relative path inside the main checkout, and walks up to the
main checkout's top looking for `.claude/fleet-kit.json`. The first one found governs; none found means the
kit is silent there. That is how one config covers every worktree of a repository, and how a config in
`fuentes/discovery-api/` covers exactly that subtree of a larger repository.

## 4. Hook registration per repository

In `<project>/.claude/settings.local.json`, next to whatever the owner already has (discovery_fe's
`permissions` entry is preserved):

| Event | Matcher | Manifest (`~/.claude/fleet-kit/manifests/`) | Guards |
|---|---|---|---|
| PreToolUse | `Bash\|PowerShell` | `pretooluse-shell.json` | `landing-guard`, `worktree-tenancy` |
| PreToolUse | `Agent\|Task` | `pretooluse-delegation.json` | `orphan-work` |
| PreToolUse | `SubagentHandback` | `pretooluse-handback.json` (timeout 900 s: it may run the coverage suite) | `handback` |

Each entry runs the GLOBAL dispatcher on a kit manifest:
`node "$HOME/.claude/hook-dispatch/dispatch.mjs" "$HOME/.claude/fleet-kit/manifests/<manifest>.json"`.
Each guard also carries its own `<guard>.hook-registration.json` sidecar, which the dispatcher reads so a
guard only runs for the tools it declares. Every guard fails OPEN on its own malfunction and journals it
under `~/.claude/fleet-kit/state/`.

## 5. How the kit is tested

- **Constructed fixtures, never live state.** Every selftest builds its own git repositories under the OS
  temp dir (or drives pure decisions with literal text) and exercises each state its decision ranges over:
  the allow states, the refuse states, the near misses, and the malfunction (fail-open) states.
- **Mutants.** Each mechanism that DECIDES (`mutation-proof/scope.mjs` lists them; a verdict is what makes a
  module decide) has a `mutants.mjs` campaign run through the vendored
  `mutation-proof/run-mutants.mjs`: a green baseline is required first, every mutant must parse, the text it
  replaces must occur exactly once, and every mutant must turn the selftest red.
- **Vendored code is proven by provenance, not re-tested.** The kit keeps no vendoring of its own: it imports
  the install's single vendored set (`~/.claude/shell-command/`, `cherry-pick-guard/working-directory.mjs`,
  `agent-liveness/`, `brief-tenancy/tenancy-declaration.mjs`, `diff-coverage/lib/`, `mutation-proof/`), which
  `~/.claude/vendored/PROVENANCE.json` pins by sha256. `node ~/.claude/vendored/vendored.mjs check` fails when a
  copy was edited or the b100 source moved on since the last `sync`. Their behaviour stays proven by b100's own
  selftests; the kit never forks them. (Until 2026-10-06 the kit had a second record under `vendor/`, which
  had drifted to an older `shell-command.mjs` and the pre-classification runner; it was folded into this one.)
- **`selftest-all.mjs` / `mutants-all.mjs`** run every campaign and report per-mechanism results.
- **Live proof**, without touching tracked files: the grader in `--plan` mode (read-only: diff, classify,
  preconditions, the exact command it would run) on each repository, and one real-shaped payload per
  registered guard through the real dispatcher.

## 6. What each mechanism can NOT see, per repository

**All repositories**
- Hooks see only Claude Code's tool calls. A human's terminal, an IDE, or a server-side merge request merge
  moves the integration branch without any of these guards seeing it. Only server branch protection closes that.
- Parameter expansion (`git merge $B`) and git aliases are not evaluated by the tokenizer; a move whose target
  the line makes unknowable is a finding, not an allow. But a git invocation whose DIRECTORY the line makes
  unknowable (`cd $X && git …`) cannot be attributed to any repository, so no config governs it and it is
  skipped. `-C` is followed; `--git-dir` / `--work-tree` are not. A `push` naming no remote is resolved
  against `origin`'s remote-tracking ref.
- `gate-run` grades only CLEAN trees (no porcelain entry, untracked included, before and after the run), so
  its verdict is exactly `HEAD^{tree}`. A dirty checkout cannot earn a verdict; the kit never hashes a dirty
  tree into a synthetic one.
- Agent liveness is transcript freshness (30-minute window, vendored as measured in b100): an agent inside one
  tool call longer than that reads as stopped.

**di_1700002_discovery_fe**
- The main checkout holds 418 porcelain entries of someone's work, so the diff-coverage grader and `gate-run`
  REFUSE there until it is committed or cleaned by its owner. They work in clean worktrees.
- Agent worktrees get no `node_modules` (no provisioner in this repo — §2), so a coverage run inside one reports
  "cannot grade: toolchain missing" until provisioning exists. The handback guard therefore refuses a worker's
  handback at most 3 times on that reason, then lets it through.
- The app target's real configuration is Angular's built-in Karma config, which emits no lcov. The grader
  supplies its OWN Karma config from its run directory (no tracked change): for `angular-builtin` it mirrors
  Angular 19.2's built-in frameworks/plugins and refuses on any other `@angular-devkit/build-angular` major, so
  an upgrade is a loud refusal rather than a silently different harness. For the library it loads the
  library's own config and only redirects coverage output and disables its thresholds for this run.
- Karma coverage is istanbul over source maps: a changed line with no `DA` record (a type-only line, a
  decorator argument the map does not attribute) is invisible — no finding, never a pass by inspection.
- Karma reports specs, not files: a spec FILE that never loads is invisible unless its absence changes the
  executed count. Any skipped or focused spec (`Executed X of Y` with X < Y) makes the run incomplete and the
  grader refuses it — including a legitimate `xit`.
- `codeCoverageExclude` paths are never instrumented; changed lines there are reported as `skipped`.

**legacy discovery-api** (`fuentes/discovery-api/`)
- **No test runner, no tests, no coverage exist.** Diff coverage, `gate-run` and the landing guard CANNOT apply,
  and the kit does not invent a runner: their config sections are disabled with that reason, and the grader
  says so when asked. The landing guard would otherwise refuse every integration move forever, since no verdict
  can exist.
- What does apply: the handback's uncommitted-work half, worktree tenancy, and orphaned-work detection.
- The config governs only the `fuentes/discovery-api/` subtree of a larger repository; a command run from the
  repository top level is outside it, by construction.

## 7. Stop conditions checked

No mechanism required changing a tracked file in either repository: the Karma gap is closed with a run-local
wrapper config, and everything else is configuration in excluded `.claude/` folders. The legacy backend's
missing test runner is a NOT-APPLICABLE, stated above, not a tracked-file change.

---

## @es — Espejo en español

# fleet-kit — guardas de flota portables con configuración por repositorio

Directiva del dueño, 2026-09-30: portar a los repositorios de discovery, deliberadamente, los mecanismos de la
flota que valen en todo proyecto, empaquetados como tooling GENÉRICO con configuración por repositorio, nunca
copiados a mano.

El kit vive una sola vez, en `~/.claude/fleet-kit/`. Un repositorio se adhiere con dos ficheros locales
excluidos de git: `<proyecto>/.claude/fleet-kit.json` (qué ES el repositorio) y
`<proyecto>/.claude/settings.local.json` (qué hooks del kit corren). Nada del árbol versionado de ningún
repositorio se lee como configuración ni se escribe.

## 1. Qué se midió antes de diseñar (2026-09-30)

- **di_1700002_discovery_fe**: el workspace npm es `Discovery-FE/`. Rama de integración `develop` (la punta de
  `origin/develop` es `Merge branch 'feature/sonar-passed' into 'develop'`; las merge requests apuntan ahí).
  418 entradas de porcelain, 300 de ellas ficheros versionados modificados (trabajo en curso de otra persona).
  Karma + Jasmine con `@angular-devkit/build-angular:karma` 19.2.22. La librería emite `lcovonly` con su propio
  `karmaConfig`; **el target de la app no nombra `karmaConfig` en `angular.json`, así que corre la configuración
  integrada de Angular, que solo emite `html` + `text-summary`: ningún lcov**. Los `Discovery-FE/karma.conf.{js,cjs}`
  versionados son configuraciones parciales que nada referencia. Las rutas `SF:` del lcov son relativas al
  workspace y con barras invertidas.
- **discovery-api legado**: subcarpeta `fuentes/discovery-api/` del repositorio `di_1700002_insight_web`. Rama de
  integración `develop` (`origin/HEAD -> origin/develop`). 0 entradas sucias. **Sin runner de tests**: los scripts
  de `package.json` son solo `start*`, las devDependencies solo grunt/ofuscador, cero `*.spec.js`/`*.test.js` fuera
  de un componente bower vendorizado.

El primer objetivo, `Projects/discovery-api` (NestJS 11 + Jest 30), se midió y se descartó por la corrección del
dueño. No se escribió nada en él.

## 2. Mecanismos: qué es portable y qué se queda

Portable significa que la PREGUNTA que responde el mecanismo existe en todo repositorio y que cada constante de
b100 de la que depende se puede expresar como configuración.

- `hook-dispatch/`: ya es global; se **reutiliza**, no se reconstruye.
- Tokenizador de shell, gramática de invocaciones git, núcleo puro de diff-coverage (diff, lcov, calificación),
  vivacidad de agentes con su parser de `TENANCY:`, y el corredor de mutantes: **vendorizados idénticos byte a
  byte** en el único vendorizado de `~/.claude/` (`vendored/vendored.mjs`), con procedencia comprobada.
- Corredor, clasificador y completitud de diff-coverage: **reescritos** alrededor de la configuración, con un
  adaptador por framework de tests (hoy Karma).
- `gate-run/`: **reescrito y más pequeño**: registra un comando de suite unitaria configurado por árbol LIMPIO.
- `ungated-landing-guard/`: **reescrito**, solo el piso (suite unitaria); ramas y modo desde la configuración;
  cubre también `commit`/`cherry-pick`, porque estos repositorios no tienen guarda de rama de integración en husky.
- `worktree-tenancy/`: **reescrito** sobre el tokenizador vendorizado, eximiendo al propio agente dueño.
- `orphan-work-guard/`: **reescrito** con un predicado llano: entradas de porcelain, o commits que `git cherry`
  no encuentra en la rama de integración.
- `fleet-env/handback.mjs`: **reescrito**: trabajo sin commitear rechaza el handback; después, la cobertura de diff
  de la rama del worker rechaza líneas cambiadas sin cubrir.
- Aprovisionamiento de worktrees y `toolchain-guard/`: portables en principio, **no construidos ahora**; la granja
  de junctions está atada al `node_modules` único de b100. Hueco declarado en §6.
- `integrate/`, `cherry-pick-guard/`, `ungated-commit-guard/`, expansión de la cadena de gates, contratos,
  formato, stash, task-ledger: **se quedan en b100**, codifican su política.
- eval-guard, brief-provenance, claim guard, failure-capture: ya son globales; no se duplican.

## 3. Esquema de configuración

Cada sección de mecanismo es su configuración o `{ "enabled": false, "reason": "<por qué, ≥ 20 caracteres>" }`:
una sección desactivada DEBE decir por qué, porque el silencio se lee como cobertura. Las claves desconocidas se
rechazan, para que una errata no desactive una guarda en silencio. Las rutas son relativas al repositorio con `/`,
como las de `git diff`. Los valores de cada repositorio son los de la sección inglesa, derivados de §1; en el
legado, `unitSuite`, `coverage` y `landingGuard` van desactivados con su motivo (no existe runner) y la cobertura
del handback va en `off`, mientras su mitad de trabajo sin commitear sigue aplicando.

**Descubrimiento de la configuración.** Desde el directorio donde actúa un comando, se le pide a git el nivel
superior y el git dir común (así un worktree enlazado se mapea a su checkout principal), se mapea el directorio a
la misma ruta relativa dentro del checkout principal y se sube hasta su raíz buscando `.claude/fleet-kit.json`. La
primera que aparece gobierna; si no hay ninguna, el kit calla.

## 4. Registro de hooks por repositorio

En `<proyecto>/.claude/settings.local.json`, conservando lo que el dueño ya tenga (la entrada `permissions` de
discovery_fe se preserva): `PreToolUse` `Bash|PowerShell` → `landing-guard` y `worktree-tenancy`;
`Agent|Task` → `orphan-work`; `SubagentHandback` → `handback` (timeout 900 s). Cada entrada corre el dispatcher
GLOBAL sobre un manifiesto del kit; cada guarda lleva su sidecar de registro y falla ABIERTA ante su propia
avería, registrándola en `~/.claude/fleet-kit/state/`.

## 5. Cómo se prueba el kit

Fixtures construidos (repositorios git temporales o texto literal) que recorren cada estado de cada decisión;
campañas de mutantes, exigidas a los mecanismos que DECIDEN (las lista `mutation-proof/scope.mjs`), con el corredor vendorizado (línea base verde, mutantes que parsean, texto único, y cada
mutante debe poner el selftest en rojo); el código vendorizado se prueba por procedencia (sha256 contra la fuente),
no se bifurca; `selftest-all.mjs` y `mutants-all.mjs` lo corren todo; y la prueba en vivo usa el calificador en
modo `--plan` (solo lectura) y un payload real por guarda registrada, sin tocar ficheros versionados.

## 6. Qué NO puede ver cada mecanismo, por repositorio

**Todos**: los hooks solo ven las llamadas de Claude Code, nunca la terminal de una persona ni un merge del
servidor; la expansión de parámetros y los alias de git no se evalúan (un destino incognoscible es un hallazgo, pero una
invocación cuyo DIRECTORIO es incognoscible no se puede atribuir a ningún repositorio y se omite; se sigue `-C`, no
`--git-dir`/`--work-tree`; un `push` sin remoto se resuelve contra `origin`);
`gate-run` solo califica árboles LIMPIOS; la vivacidad es frescura del transcript (ventana de 30 minutos).

**discovery_fe**: el checkout principal tiene 418 entradas de trabajo ajeno, así que el calificador y `gate-run`
RECHAZAN ahí; funcionan en worktrees limpios. Los worktrees de agente no tienen `node_modules` (no hay
aprovisionador), así que la cobertura dentro de uno dice «no se puede calificar» y el handback rechaza como mucho
3 veces por ese motivo. El target de la app no emite lcov con su configuración real: el calificador aporta su
PROPIA configuración de Karma desde su directorio de corrida, espejo de la integrada de Angular 19.2, y se niega
ante otra versión mayor. Karma cubre por source maps: una línea cambiada sin registro `DA` es invisible. Karma
cuenta specs, no ficheros; cualquier spec saltado o enfocado vuelve incompleta la corrida y se rechaza. Las rutas
de `codeCoverageExclude` se reportan como `skipped`.

**discovery-api legado**: **no existen runner, tests ni cobertura**. Cobertura de diff, `gate-run` y la guarda de
aterrizaje NO pueden aplicar y el kit no inventa un runner: sus secciones van desactivadas con ese motivo. Aplican
la mitad de trabajo sin commitear del handback, la tenencia de worktrees y la detección de trabajo huérfano. La
configuración gobierna solo el subárbol `fuentes/discovery-api/`.

## 7. Condiciones de parada comprobadas

Ningún mecanismo exigió cambiar un fichero versionado: el hueco de Karma se cierra con una configuración local a la
corrida, y lo demás es configuración en carpetas `.claude/` excluidas. La falta de runner del legado es un NO
APLICA declarado, no un cambio en ficheros versionados.
