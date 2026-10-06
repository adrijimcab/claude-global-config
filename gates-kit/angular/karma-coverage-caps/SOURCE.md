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

## Per major and reporter (2026-10-06)

Every `toolchains/angular-<major>` pins this runner (Karma 6.4.4, karma-jasmine 5.1.0, karma-chrome-launcher
3.2.0, karma-coverage 2.2.1, and the `jasmine-core` its major's `ng new` writes: 5.6.0, 5.9.0, 6.0.1, 6.3.0),
because Angular 21 and 22 still support Karma and the gate runs the runner the PROJECT uses, not the major's
default. The command now names its reporters (`--reporters dots,coverage`, matching `config.karma.cjs`):
`dots` writes plain lines for a log reader where `progress` rewrites its line in place.
UNVERIFIED on Linux: this session's container has no Chrome and its download host is refused by the egress
policy, so the gate was last measured green and red on Windows (above), before the reporter change; here it
stops at "No binary for ChromeHeadless browser", which `verify.mjs` reports as a failure, never a pass.
@es Cada `toolchains/angular-<major>` fija este runner, porque Angular 21 y 22 siguen soportando Karma y el gate
corre el runner que USA el proyecto, no el de por defecto de la major. El comando nombra ahora sus reporters
(`--reporters dots,coverage`, igual que `config.karma.cjs`). SIN VERIFICAR en Linux: el contenedor de esta
sesión no tiene Chrome y la política de salida rechaza su descarga; aquí se para en "No binary for
ChromeHeadless browser", que `verify.mjs` informa como fallo, nunca como pase.
