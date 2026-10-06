# vitest-coverage-caps

Vitest with the V8 coverage provider and global `coverage.thresholds`: the run exits non-zero when statements,
branches, functions or lines fall under their cap, even though every spec passes. Coverage is collected from
every source file of the target (`coverage.include`), so a file no spec imports still counts. Reports go to
the system temp directory, so a run leaves nothing in the kit. The target directory arrives as `--root <dir>`
and the config is read from the gate folder next to it.
@es Vitest con el proveedor de cobertura V8 y `coverage.thresholds` globales: la corrida sale con código
distinto de cero cuando una métrica queda bajo su tope aunque todos los specs pasen. La cobertura se recoge de
cada fuente del directorio, así que un fichero que ningún spec importa también cuenta. Los informes van al
directorio temporal del sistema. El directorio llega como `--root <dir>` y la config se lee de la carpeta del
gate, a su lado.

## Chosen numbers and why

Statements 85, branches 80, functions 85, lines 85: the same floor as `angular/karma-coverage-caps`, which
took them from the measured values of `b100-am-ui`'s library. No Node library was measured
for this gate, so these are a stated floor, not a measurement. All four are at or above the kit floor (80),
which `config-rules.mjs` enforces on this config.

## Sources (not re-fetched)

- `templates/node-lib-vitest/AGENT-CONTRACT.md` G3 ("Vitest with coverage caps").
- `fleet-kit-integration.md` (`diff-coverage` reads the lcov a Vitest run emits).
- https://vitest.dev/config/coverage (`provider`, `include`, `thresholds`; a threshold miss sets the exit code).

## Fixtures

- `pass/`: two functions, both called by the spec (statements 100%).
- `fail/`: the same two plus `discount` (with a branch) and `round`, never called: statements 53.33%,
  branches 100%, functions 50%, lines 53.33% (measured with V8 coverage); three caps are missed, all specs
  still pass, so the exit comes from the coverage caps, not a test. Both sides are plain ES modules with test
  globals, so a fixture imports nothing from the toolchain.

## Why `{target}/../config.vitest.mjs`

Vitest resolves `--config` against `--root`, and the root is the fixture, so the config is named by its place
beside the fixture folders (`pass/` and `fail/` are children of the gate folder).

## Why the provider is named by its path

Measured with Vitest 3.2.7 (node 22.22.0): the coverage provider is looked up from the root Vitest runs in,
which is the fixture and holds no `node_modules`, so `provider: 'v8'` fails with "Failed to load url
@vitest/coverage-v8". The config names the same package by its path in the toolchain instead
(`provider: 'custom'` and `customProviderModule`), resolved from `GATES_KIT_TOOLCHAIN` as the lint configs do.
Vitest 5.0.3 finds the provider next to itself, but Stryker's runner does not work under Vitest 5 (see
`stryker-mutation`), and a toolchain holds one Vitest: it is 4.1.11, where the same config is measured green
on `pass/` and red on `fail/` (2026-10-06).

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `vitest` and `@vitest/coverage-v8`
(pinned in `gates-kit/toolchains/node-vitest/package.json`). Without it the launcher exits 3.
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules`, `vitest` y `@vitest/coverage-v8` (fijados
en `gates-kit/toolchains/node-vitest/package.json`). Sin él el lanzador sale con 3.
