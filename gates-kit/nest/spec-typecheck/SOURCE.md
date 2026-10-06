# spec-typecheck

`tsc --noEmit -p <dir>` over the spec files, with the strict flags of the Angular gate (`strict`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`) plus the two decorator flags a
Nest codebase needs (`experimentalDecorators`, `emitDecoratorMetadata`). A spec is code too: a runner that
transpiles without type-checking (ts-jest with `isolatedModules`, esbuild) runs a spec that does not compile.
@es `tsc --noEmit -p <dir>` sobre los specs, con los flags estrictos del gate de Angular más los dos flags de
decoradores que necesita un código Nest. Un spec también es código: un runner que transpila sin comprobar
tipos (ts-jest con `isolatedModules`, esbuild) ejecuta un spec que no compila.

## Sources (not re-fetched)

- https://www.typescriptlang.org/tsconfig (each compiler flag in `config.tsconfig.json`).
- `templates/nest-api/AGENT-CONTRACT.md` G3 (`tsc --noEmit` is a gate of the stack).
- The HYPOTHESIS recorded for `discovery-api` in the Angular explore record (engram #1147): `ts-jest` with
  `isolatedModules` may skip spec type-checking. This gate does not depend on it being true: it checks the
  types whatever the runner does.

## Fixtures

- `pass/sum.spec.ts`: calls `sum(1, 2)` with numbers.
- `fail/sum.spec.ts`: calls `sum('1', 2)`, TS2345. Each side has its own `tsconfig.json` extending
  `config.tsconfig.json`, so `tsc -p {target}` checks exactly that side. `types` is empty: the fixtures use no
  test globals.
- `decorated.ts` on both sides: a class with a legacy parameter decorator, as in a Nest controller. It
  compiles only with `experimentalDecorators`, so removing that flag turns the pass fixture red.

## Not measured here (stated)

The compiler flags were not measured in a Nest repository; they are the Angular gate's strict set plus the
decorator flags Nest requires.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `typescript`
(`gates-kit/toolchains/nest/package.json`).
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules` y `typescript`
(`gates-kit/toolchains/nest/package.json`).

## TypeScript 6 (2026-10-06)

With the toolchain on TypeScript 6.0.3 the former `"module": "commonjs", "moduleResolution": "node"` stopped
the pass fixture with TS5107 ("moduleResolution=node10 is deprecated"). The config now uses
`"module": "nodenext", "moduleResolution": "nodenext"`, what `@nestjs/schematics@12.0.6` writes for a new Nest
12 project; `ignoreDeprecations` was not used, it would silence the compiler instead of fixing the config.
Measured: pass exits 0, fail exits 2 with TS2345. `--pretty false` keeps each diagnostic one plain line.
@es Con TypeScript 6.0.3 la config anterior paraba el fixture pass con TS5107. Ahora usa `nodenext`, lo que
escribe `@nestjs/schematics@12.0.6` para un proyecto Nest 12 nuevo; no se usó `ignoreDeprecations`, que
silenciaría el compilador en vez de arreglar la config. Medido: pass sale con 0, fail con 2 (TS2345).
