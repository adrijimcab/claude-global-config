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
measured on `discovery-api`). Nothing else is installed: the lockfile was produced with
`npm install --package-lock-only --ignore-scripts`.

@es Cada uno es una herramienta que el contrato del dueño para el stack ya nombra. No se instala nada más: el
lockfile se generó con `npm install --package-lock-only --ignore-scripts`.
