# spec-typecheck

`tsc --noEmit -p <dir>` over the spec files, with the strict flags of the Angular gate (`strict`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`). A spec is code too: Vitest
transpiles with esbuild and never type-checks, so it runs a spec that does not compile; `tsc --noEmit` is the
check that reads the types.
@es `tsc --noEmit -p <dir>` sobre los specs, con los flags estrictos del gate de Angular. Un spec también es
código: Vitest transpila con esbuild y nunca comprueba tipos, así que ejecuta un spec que no compila;
`tsc --noEmit` es la comprobación que lee los tipos.

## Sources (not re-fetched)

- https://www.typescriptlang.org/tsconfig (each compiler flag in `config.tsconfig.json`).
- `templates/node-lib-vitest/AGENT-CONTRACT.md` G3 (`tsc --noEmit` is a gate of the stack).
- https://vitest.dev/guide/features (Vitest runs TypeScript through esbuild, which strips types).

## Fixtures

- `pass/sum.spec.ts`: calls `sum(1, 2)` with numbers.
- `fail/sum.spec.ts`: calls `sum('1', 2)`, TS2345. Each side has its own `tsconfig.json` extending
  `config.tsconfig.json`, so `tsc -p {target}` checks exactly that side. `types` is empty: the fixtures use
  no test globals.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `typescript`
(`gates-kit/toolchains/node-vitest/package.json`).
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules` y `typescript`
(`gates-kit/toolchains/node-vitest/package.json`).
