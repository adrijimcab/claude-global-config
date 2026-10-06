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

Vitest is 4.1.11, not the latest: Stryker 10.0.0's Vitest runner lets every mutant survive under Vitest 5.0.3,
and runs the specs under 4.1.11 (measured; see `node-vitest/stryker-mutation/SOURCE.md`). Raise Vitest only
together with a Stryker whose runner is measured to run the specs.

The lockfile: see Versions.

@es Cada uno es una herramienta que el contrato del dueño para el stack ya nombra. Vitest es la 4.1.11, no la
última: con Vitest 5.0.3 el runner de Stryker 10.0.0 deja sobrevivir todo mutante, con la 4.1.11 ejecuta los
specs (medido). Subir Vitest solo junto con un Stryker cuyo runner se mida que ejecuta
los specs. El lockfile: ver Versiones.

## Versions (npm, 2026-10-06; latest stable only)

ESLint 10.12.0 (`latest`; flat config only, which every gate config already is), typescript-eslint 8.71.1
(`latest`; peers `typescript >=4.8.4 <6.1.0`), TypeScript 6.0.3: the newest TypeScript typescript-eslint
accepts (TypeScript 7.0.2 is npm `latest` but outside that peer range); Vitest 4.1.11, not 5, because Stryker 10.0.0 is still `latest` (see above). The lockfile was produced with
`npx npm@11.21.0 install --package-lock-only --ignore-scripts`, as the Angular toolchains' (npm 10 writes
Angular locks `npm ci` refuses); `npm ci` with npm 10.9.4 installs it. Every package of the lockfile accepts
Node `^22.18.0 || >=24.11.0` (`toolchainFor` refuses any other).
@es ESLint 10.12.0, typescript-eslint 8.71.1 y TypeScript 6.0.3, el TypeScript más nuevo que admite
typescript-eslint; Vitest 4.1.11 y no 5 porque Stryker 10.0.0 sigue siendo `latest`. El lockfile se generó con npm 11.21.0; `npm ci` con npm 10.9.4 lo instala. Todo
paquete del lockfile acepta Node `^22.18.0 || >=24.11.0` (`toolchainFor` rechaza cualquier otro).
