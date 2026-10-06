# Node and Vitest gates toolchain

Pinned packages the Node and Vitest gates run on (exact versions, no ranges; `package-lock.json` makes the
install reproducible). Install once, outside every repository: copy `package.json` and `package-lock.json`
into a directory such as `~/.claude-toolchains/node-vitest`, run `npm ci --no-audit --no-fund` there, then run
the gates with `GATES_KIT_TOOLCHAIN` set to that directory (`node gates-kit/verify.mjs --stack node-vitest`).
`node_modules` is never committed.

@es Paquetes fijados sobre los que corren los gates de Node y Vitest (versiones exactas, sin rangos;
`package-lock.json` hace reproducible la instalación). Se instala una vez, fuera de todo repositorio: copiar
`package.json` y `package-lock.json` a un directorio como `~/.claude-toolchains/node-vitest`, ejecutar allí
`npm ci --no-audit --no-fund` y correr los gates con `GATES_KIT_TOOLCHAIN` apuntando a ese directorio
(`node gates-kit/verify.mjs --stack node-vitest`). `node_modules` nunca se versiona.

## Why these packages / Por qué estos paquetes

Each one is a tool the owner's contract for the stack already names (`templates/node-lib-vitest/
AGENT-CONTRACT.md` G3): `eslint` and `typescript-eslint` (strict-type-checked lint), `typescript`
(`tsc --noEmit`), `vitest` with `@vitest/coverage-v8` (coverage caps; the provider is Vitest's own coverage
package), `@stryker-mutator/core` with `@stryker-mutator/vitest-runner` (mutation testing).

Vitest is 3.2.7, not the latest: Stryker 10.0.0's Vitest runner reported 0 tests run per mutant under Vitest 5.0.3, and Vitest 4.1.11
could not be locked with npm 10.9.4 (measured; see `node-vitest/stryker-mutation/SOURCE.md`). Raise Vitest only
together with a Stryker whose runner is measured to run the specs.

The lockfile was produced with `npm install --package-lock-only --ignore-scripts`.

@es Cada uno es una herramienta que el contrato del dueño para el stack ya nombra. Vitest es la 3.2.7, no la
última: el runner de Vitest de Stryker 10.0.0 informó 0 tests ejecutados por mutante con Vitest 5.0.3, y Vitest 4.1.11 no se
pudo bloquear con npm 10.9.4 (medido). Subir Vitest solo junto con un Stryker cuyo runner se mida que ejecuta
los specs. El lockfile se generó con `npm install --package-lock-only --ignore-scripts`.
