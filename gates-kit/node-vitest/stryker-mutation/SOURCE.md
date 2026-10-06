# stryker-mutation

Stryker mutation testing with the Vitest runner: every source file of the target is mutated, the specs run
against each mutant, and the run exits non-zero when the mutation score falls under `thresholds.break`. A
mutant the specs let live is a branch whose behavior no assertion pins down, which line coverage cannot see.
This is the "Stryker mutation testing" gate of `templates/node-lib-vitest/AGENT-CONTRACT.md` (G3 and G1: a
surviving mutant is killed by a new assertion, never by excluding the mutated file).
@es Pruebas de mutación con Stryker y el runner de Vitest: se muta cada fuente del directorio, los specs
corren contra cada mutante, y la corrida sale con código distinto de cero cuando la puntuación de mutación
queda bajo `thresholds.break`. Un mutante que los specs dejan vivir es un comportamiento que ninguna aserción
fija, algo que la cobertura de líneas no ve. Es el gate de "pruebas de mutación con Stryker" de
`templates/node-lib-vitest/AGENT-CONTRACT.md` (G3 y G1: un mutante superviviente se mata con una aserción
nueva, nunca excluyendo el fichero mutado).

## Chosen numbers and why

`break` 80: the kit floor (`config-rules.mjs` refuses a `break` under it). No Node library was measured for
this gate, so the number is a stated floor, not a measurement. `high` 95 and `low` 90 only colour the report.

## Sources (not re-fetched)

- `templates/node-lib-vitest/AGENT-CONTRACT.md` G1 and G3.
- https://stryker-mutator.io/docs/stryker-js/configuration (`mutate`, `thresholds.break`, `tempDirName`).
- https://stryker-mutator.io/docs/stryker-js/vitest-runner (the runner and its `vitest.configFile` option).
- The ledger note in `engram-title-integrity/backfill.mjs`: Stryker's `disableTypeChecks` prepends
  `@ts-nocheck` to every file and fakes a RED. These fixtures are JavaScript, so the default is harmless here;
  a project that mutates TypeScript adds the checker and must not rely on `disableTypeChecks`.

## Fixtures

- `pass/`: `isAdult(age)` is `age >= 18`; the spec asserts 17 is false and 18 is true. Stryker makes 5
  mutants and the specs kill all of them (score 100, measured).
- `fail/`: the same code, and a spec that only asserts `isAdult(30)` is true. Line coverage is 100% and the
  spec passes, but `>=` to `>` and the constant `true` live: 2 of 5 survive, score 60 (measured), so the exit
  comes from the break score, not a failing test.

## Why `mutate` names `!*.spec.js`

The globs are relative to the target. The negation keeps the specs out of the mutation, which is not an
exception to a rule: a spec is not product code. It is the only negation in the config, and it names the spec
files by their suffix, never a product file.

## Why `--cwd`, and why `{target}/../config.stryker.mjs`

Stryker takes its project from the folder it runs in, so the command runs it from the target
(`run-tool.mjs --cwd {target}`) and names the config by its place beside the `pass/` and `fail/` folders. The
working copy goes to the system temp directory (`tempDirName`), so a run leaves nothing in the fixture.

## Why Vitest 4.1.11 and Stryker 10.0.0

Measured here (node 22.22.0): `@stryker-mutator/core` and `vitest-runner` 10.0.0 run the specs under Vitest
3.2.7 and, re-measured 2026-10-06, under Vitest 4.1.11 (pass: 5 killed of 5, "Ran 1.40 tests per mutant",
exit 0; fail: 3 killed, 2 survived, score 60 under the break of 80, exit 1). Under Vitest 5.0.3 it still
fails: an earlier run reported "Ran 0.00 tests per mutant", and the 2026-10-06 run listed the tests as run
yet let every mutant of `pass/` survive (exit 1). Vitest 4.1.11, which npm 10.9.4 could not lock, is locked
with npm 11.21.0. So the toolchain pins Vitest 4.1.11, the newest major measured to work with Stryker 10.0.0
(still `latest`); raise it to 5 only with a Stryker measured to kill mutants under it.
@es Medido: Stryker 10.0.0 ejecuta los specs con Vitest 3.2.7 y con 4.1.11 (re-medido el 2026-10-06); con
Vitest 5.0.3 sigue fallando (todo mutante de `pass/` sobrevive). Vitest 4.1.11 se bloquea con npm 11.21.0. La
toolchain fija la 4.1.11, la major más nueva medida que funciona con Stryker 10.0.0.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `@stryker-mutator/core`,
`@stryker-mutator/vitest-runner` and `vitest` (pinned in `gates-kit/toolchains/node-vitest/package.json`).
Without it the launcher exits 3.
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules`, `@stryker-mutator/core`,
`@stryker-mutator/vitest-runner` y `vitest` (fijados en `gates-kit/toolchains/node-vitest/package.json`). Sin
él el lanzador sale con 3.
