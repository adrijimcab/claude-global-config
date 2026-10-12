# dependency-cruiser-layering

dependency-cruiser over the `src/` tree with three error rules, the hexagonal direction of dependencies: `core`
never imports a `pages` feature (`core-not-from-pages`), `core` never imports an `adapters` or `infrastructure`
folder (`core-not-from-adapters`: an adapter implements a port core owns), and a `domain` folder never imports
the Angular framework (`domain-framework-free`). A project with no `adapters`, `infrastructure` or `domain`
folder passes those rules vacuously, which is the intended zero-offenders landing. No exclusion, ignore or
allowance of any kind. The sibling gate `dependency-cruiser-circular` owns the no-cycle rule.
@es dependency-cruiser sobre el árbol `src/` con tres reglas de error, la dirección hexagonal de las
dependencias: `core` nunca importa una feature de `pages`, `core` nunca importa una carpeta `adapters` o
`infrastructure` (un adaptador implementa un puerto que posee core) y una carpeta `domain` nunca importa el
framework Angular. Un proyecto sin carpetas `adapters`, `infrastructure` o `domain` pasa esas reglas de forma
vacía, que es el aterrizaje con cero infractores buscado. Ninguna exclusión, ignorado ni permiso. El gate
hermano `dependency-cruiser-circular` se ocupa de la regla de ciclos.

## Sources (from the explore record, engram #1147; not re-fetched)

- https://github.com/sverweij/dependency-cruiser (rules `forbidden`, `from`/`to` paths, `options.doNotFollow`).
- The gap recorded in #1147: the kit had no architecture-boundary gate. The layer names follow
  `Discovery-FE/src/app/{core,pages}` (explore record); `adapters`, `infrastructure` and `domain` are the
  hexagonal names (ports and adapters).

## Fixtures

- `pass/src/app/`: `pages/home.ts` imports `core/clock.ts`, the allowed direction; `core/domain/money.ts` imports nothing.
- `fail/src/app/`: three violations, one per rule. `core/clock.ts` imports `pages/home.ts`; `core/ports.ts`
  imports `adapters/storage.ts`; `core/domain/price.ts` imports `@angular/core`. Each rule fires on its own
  line of the report; removing a rule drops its line.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `dependency-cruiser` 18.5.0 (pinned in
`gates-kit/toolchains/angular-<major>/package.json`, every major; the package exposes no `./package.json` export, so `run-tool.mjs`
reads the manifest from `<toolchain>/node_modules/<package>/package.json` directly).
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules` y `dependency-cruiser` 18.5.0 (fijado en
`gates-kit/toolchains/angular-<major>/package.json`, en cada major).
