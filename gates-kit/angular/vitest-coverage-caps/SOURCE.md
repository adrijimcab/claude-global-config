# vitest-coverage-caps

Vitest with the V8 coverage provider and global `coverage.thresholds` for an Angular project that tests with
Vitest: the run exits non-zero when statements, branches, functions or lines fall under their cap, even though
every spec passes. Coverage is collected from every source file of the target (`coverage.include`), so a file
no spec imports still counts. Reports and Vite's cache go to the system temp directory, so a run leaves
nothing in the kit. The same gate as `node-vitest/vitest-coverage-caps`, here because the Angular toolchains
pin Vitest per major.
@es Vitest con el proveedor de cobertura V8 y `coverage.thresholds` globales para un proyecto Angular que testea
con Vitest: la corrida sale con código distinto de cero cuando una métrica queda bajo su tope aunque todos los
specs pasen. El mismo gate que `node-vitest/vitest-coverage-caps`, aquí porque las toolchains de Angular fijan
Vitest por major.

## Which toolchains run it

`toolchainFor` (`gates-kit/toolchain-for.mjs`) hands this gate's runner to an Angular project only when the
project itself uses Vitest (`profile.testRunner`), never because Vitest is its major's default:

| Toolchain | Vitest | Why |
|---|---|---|
| `angular-19` | none; the gate is NOT APPLICABLE there | Angular 19's `ng new` has no Vitest option (`@schematics/angular@19.2.27`) |
| `angular-20` | 3.2.7 | `@angular/build@20.3.38` peers `vitest ^3.1.1`; its `unit-test` builder is experimental |
| `angular-21` | 4.1.11 | `@angular/build@21.2.25` peers `vitest ^4.0.8`; `ng new` defaults to Vitest |
| `angular-22` | 5.0.3 | `@angular/build@22.2.1` peers `^4.0.8 \|\| ^5.0.0`; `ng new` writes `^5.0.0` |

Measured 2026-10-06 on Node 22.22.0: `node gates-kit/verify.mjs --toolchain <id>` reports this gate green on
`pass/` and red on `fail/` with each of the three, and "not applicable" on `angular-19`.

## Chosen numbers and why

Statements 85, branches 80, functions 85, lines 85: the floor of `angular/karma-coverage-caps`, taken from the
measured values of `b100-am-ui`'s library. At or above the kit floor (80), enforced by `config-rules.mjs`.

## Sources (not re-fetched)

- https://vitest.dev/config/coverage (`provider`, `include`, `thresholds`; a threshold miss sets the exit code).
- `npm view @angular/build@<latest of each major> peerDependencies`, `npm pack @schematics/angular@<major>`
  (`utility/latest-versions/package.json`, `ng-new/schema.json` `testRunner`), 2026-10-06.

## Fixtures

- `pass/`: two functions, both called by the spec (statements 100%).
- `fail/`: the same two plus `discount` (with a branch) and `round`, never called: three caps are missed,
  all specs still pass, so the exit comes from the coverage caps, not a test. Plain ES modules with test
  globals, so a fixture imports nothing from the toolchain.

## Why `{target}/../config.vitest.mjs`, the provider by path, and `--reporter default`

As in `node-vitest/vitest-coverage-caps`: Vitest resolves `--config` against `--root` (the fixture), and Vitest
3 looks the coverage provider up from that root, so the config names `@vitest/coverage-v8` by its path in
`GATES_KIT_TOOLCHAIN`. The command names `--reporter default` so the report a log reader sees does not depend
on Vitest's own default or on TTY detection.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `vitest` and `@vitest/coverage-v8`
(pinned in `gates-kit/toolchains/angular-20`, `angular-21` and `angular-22`). Without it the launcher exits 3.
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules`, `vitest` y `@vitest/coverage-v8` (fijados en
`gates-kit/toolchains/angular-20`, `angular-21` y `angular-22`). Sin él el lanzador sale con 3.
