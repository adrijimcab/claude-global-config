# Nest gates toolchain

Pinned packages the Nest gates run on (exact versions, no ranges; `package-lock.json` makes the install
reproducible). Install once, outside every repository: copy `package.json` and `package-lock.json` into a
directory such as `~/.claude-toolchains/nest`, run `npm ci --no-audit --no-fund` there, then run the gates
with `GATES_KIT_TOOLCHAIN` set to that directory (`node gates-kit/verify.mjs --stack nest`).
`node_modules` is never committed.

@es Paquetes fijados sobre los que corren los gates de Nest (versiones exactas, sin rangos;
`package-lock.json` hace reproducible la instalación). Se instala una vez, fuera de todo repositorio: copiar
`package.json` y `package-lock.json` a un directorio como `~/.claude-toolchains/nest`, ejecutar allí
`npm ci --no-audit --no-fund` y correr los gates con `GATES_KIT_TOOLCHAIN` apuntando a ese directorio
(`node gates-kit/verify.mjs --stack nest`). `node_modules` nunca se versiona.

## Why these packages / Por qué estos paquetes

Each one is a tool the owner's contract for the stack already names (`templates/nest-api/AGENT-CONTRACT.md`
G3, `node-express.md`): `eslint` and `typescript-eslint` (strict-type-checked lint, the global `ValidationPipe`
rule), `typescript` (`tsc --noEmit`), `jest` (unit tests with coverage caps; Jest 30 is what `fleet-kit/DESIGN.md`
measured on `discovery-api`). Nothing else is installed.

@es Cada uno es una herramienta que el contrato del dueño para el stack ya nombra. No se instala nada más: el
lockfile: ver Versiones.

## Versions (npm, 2026-10-06; latest stable only)

ESLint 10.12.0 (`latest`; flat config only, which every gate config already is), typescript-eslint 8.71.1
(`latest`; peers `typescript >=4.8.4 <6.1.0`), TypeScript 6.0.3: the newest TypeScript typescript-eslint
accepts (TypeScript 7.0.2 is npm `latest` but outside that peer range); Nest 12's own `ng new` equivalent (`@nestjs/schematics@12.0.6`) writes `typescript ^6.0.2` and `jest ^30.0.0`; Jest 30.5.2 is `latest`. The lockfile was produced with
`npx npm@11.21.0 install --package-lock-only --ignore-scripts`, as the Angular toolchains' (npm 10 writes
Angular locks `npm ci` refuses); `npm ci` with npm 10.9.4 installs it. Every package of the lockfile accepts
Node `^20.19.0 || ^22.13.0 || >=24.0.0` (`toolchainFor` refuses any other).
@es ESLint 10.12.0, typescript-eslint 8.71.1 y TypeScript 6.0.3, el TypeScript más nuevo que admite
typescript-eslint; Nest 12 genera `typescript ^6.0.2` y `jest ^30.0.0`. El lockfile se generó con npm 11.21.0; `npm ci` con npm 10.9.4 lo instala. Todo
paquete del lockfile acepta Node `^20.19.0 || ^22.13.0 || >=24.0.0` (`toolchainFor` rechaza cualquier otro).
