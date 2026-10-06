# jest-coverage-caps

Jest with a global `coverageThreshold`: the run exits non-zero when statements, branches, functions or lines
fall under their cap, even though every spec passes. Coverage is collected from every source file of the
target (`collectCoverageFrom`), so a file no spec imports still counts. Reports go to the system temp
directory, so a run leaves nothing in the kit. The target directory arrives as `--rootDir <dir>`.
@es Jest con un `coverageThreshold` global: la corrida sale con código distinto de cero cuando una métrica
queda bajo su tope aunque todos los specs pasen. La cobertura se recoge de cada fuente del directorio, así que
un fichero que ningún spec importa también cuenta. Los informes van al directorio temporal del sistema. El
directorio llega como `--rootDir <dir>`.

## Chosen numbers and why

Statements 85, branches 80, functions 85, lines 85: the same floor as `angular/karma-coverage-caps`, which
took them from the measured values of `b100-am-ui`'s library. No Nest repository was measured for this gate,
so these are a stated floor, not a measurement of a Nest codebase. All four are at or above the kit floor
(80), which `config-rules.mjs` enforces on this config.

## Sources (not re-fetched)

- `templates/nest-api/AGENT-CONTRACT.md` G3 ("unit and end-to-end tests with coverage caps").
- `fleet-kit/DESIGN.md` §1: `discovery-api` is NestJS 11 on Jest 30, which is why Jest is this stack's runner.
- https://jestjs.io/docs/configuration#coveragethreshold-object (the `global` threshold and its exit code).

## Fixtures

- `pass/`: two functions, both called by the spec (statements 100%).
- `fail/`: the same two plus `discount` (with a branch) and `round`, never called: statements 42.85%,
  branches 0%, functions 50%, lines 42.85% (measured); all specs still pass, so the exit comes from the coverage caps, not a test.
  Both sides are plain CommonJS so the gate needs no transform; a project adds its own (ts-jest, SWC).

## Why `--projects` and not `--config`

Jest 30.5.2 fails with "Could not find a config file" when `--config` names a file that is not called
`jest.config.*` and the working directory holds no such file (measured here, node 22.22.0). The kit names its
config `config.jest.cjs`, so the command passes it as `--projects config.jest.cjs`, which Jest reads as the
single project and applies with the same global thresholds (measured: pass exits 0, fail exits 1).

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `jest` (pinned in
`gates-kit/toolchains/nest/package.json`). Without it the launcher exits 3.
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules` y `jest` (fijado en
`gates-kit/toolchains/nest/package.json`). Sin él el lanzador sale con 3.
