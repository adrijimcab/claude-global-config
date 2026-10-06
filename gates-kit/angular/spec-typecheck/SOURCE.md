# spec-typecheck

`tsc --noEmit -p <dir>` over the spec files, with the strict flags measured in `Discovery-FE/tsconfig.json`
(`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). A spec is code too: a runner that
transpiles without type-checking (esbuild, `isolatedModules`) runs a spec that does not compile.
@es `tsc --noEmit -p <dir>` sobre los specs, con los flags estrictos medidos en
`Discovery-FE/tsconfig.json`. Un spec también es código: un runner que transpila sin comprobar tipos ejecuta
un spec que no compila.

## Sources (from the explore record, engram #1147; not re-fetched)

- https://www.typescriptlang.org/tsconfig (each compiler flag in `config.tsconfig.json`).
- https://angular.dev/guide/testing (the unit-test runner story: Karma supported, Vitest default from v22).
- The gap recorded in #1147: "no spec typecheck" in the kit, and the `discovery-api` HYPOTHESIS that
  `ts-jest` with `isolatedModules` may skip spec type-checking.

## Fixtures

- `pass/sum.spec.ts`: calls `sum(1, 2)` with numbers.
- `fail/sum.spec.ts`: calls `sum('1', 2)`, TS2345. Each side has its own `tsconfig.json` extending
  `config.tsconfig.json`, so `tsc -p {target}` checks exactly that side. `types` is empty: the fixtures use
  no test globals.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `typescript` (measured with 5.8.3, 5.9.3 and 6.0.3, the pins of `toolchains/angular-19` to `angular-22`; `--pretty false` keeps the diagnostics one plain line each for a log reader).
