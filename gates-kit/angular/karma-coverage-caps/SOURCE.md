# karma-coverage-caps

Karma + Jasmine in headless Chrome with `karma-coverage`'s global `check`: the run exits non-zero when
statements, branches, functions or lines fall under their cap. Reports go to the system temp directory, so a
run leaves nothing in the kit. The target directory arrives as `--target <dir>`.
@es Karma + Jasmine en Chrome headless con el `check` global de `karma-coverage`: la corrida sale con código
distinto de cero cuando una métrica queda bajo su tope. Los informes van al directorio temporal del sistema.

## Chosen numbers and why

Statements 85, branches 80, functions 85, lines 85. These are the values MEASURED in the embedded library's
`projects/b100-am-ui/karma.conf.cjs` (wired at `angular.json:167`, explore record #1147), i.e. the floor the
repo already holds, never lowered. The app project has NO wired floor today (its test target has no
`karmaConfig`, `angular.json:112-132`, so the root 70% thresholds are not applied): this gate states the
floor the app must adopt, taken from the library's measured numbers. All four are above the kit floor (80).

## Sources (from the explore record, engram #1147; not re-fetched)

- https://angular.dev/guide/testing (Karma supported; Vitest default from v22).
- The measured finding in #1147 about the unwired root `karma.conf` thresholds and the library's 85/80/85/85.

## Fixtures

- `pass/`: two functions, both called by the spec (statements 100%).
- `fail/`: the same two plus `discount` (with a branch) and `round`, never called: statements 33.33%,
  branches 0%, functions 50%; all specs still pass, so the exit comes from the coverage caps, not a test.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `karma`, `karma-jasmine`,
`karma-chrome-launcher`, `karma-coverage` (measured with karma 6.4.4, karma-coverage 2.2.1) and a Chrome
the launcher can find. Measured here with Chrome 154 on Windows.
