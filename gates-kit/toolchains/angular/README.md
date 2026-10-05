# Angular gates toolchain

Pinned packages the Angular gates run on (exact versions, no ranges; `package-lock.json` makes the install
reproducible). Install once, outside every repository: copy `package.json` and `package-lock.json` into a
directory such as `~/.claude-toolchains/angular`, run `npm ci --no-audit --no-fund` there, then run the gates
with `GATES_KIT_TOOLCHAIN` set to that directory. `node_modules` is never committed.

@es Paquetes fijados sobre los que corren los gates de Angular (versiones exactas, sin rangos;
`package-lock.json` hace reproducible la instalación). Se instala una vez, fuera de todo repositorio: copiar
`package.json` y `package-lock.json` a un directorio como `~/.claude-toolchains/angular`, ejecutar allí
`npm ci --no-audit --no-fund` y correr los gates con `GATES_KIT_TOOLCHAIN` apuntando a ese directorio.
`node_modules` nunca se versiona.
