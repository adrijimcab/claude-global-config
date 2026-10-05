# dependency-cruiser-layering

dependency-cruiser over the `src/` tree with one error rule: the `core` layer never imports a `pages` feature
(dependencies point from pages to core). The scan is scoped with `includeOnly`; no exclusion, ignore or
allowance of any kind. The sibling gate `dependency-cruiser-circular` owns the no-cycle rule.
@es dependency-cruiser sobre el árbol `src/` con una regla de error: la capa `core` nunca importa una feature
de `pages` (las dependencias van de pages a core). El escaneo se acota con `includeOnly`; ninguna exclusión,
ignorado ni permiso. El gate hermano `dependency-cruiser-circular` se ocupa de la regla de ciclos.

## Sources (from the explore record, engram #1147; not re-fetched)

- https://github.com/sverweij/dependency-cruiser (rules `forbidden`, `from`/`to` paths, `options.includeOnly`).
- The gap recorded in #1147: the kit had no architecture-boundary gate. The layer names follow
  `Discovery-FE/src/app/{core,pages}` (explore record).

## Fixtures

- `pass/src/app/`: `pages/home.ts` imports `core/clock.ts`, the allowed direction.
- `fail/src/app/`: `core/clock.ts` imports `pages/home.ts`, the forbidden direction, with no cycle. If the rule
  is removed from `config.cjs` the fail fixture exits 0 and the verifier reports the gate red.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `dependency-cruiser` 18.5.0 (pinned in
`gates-kit/toolchains/angular/package.json`; the package exposes no `./package.json` export, so `run-tool.mjs`
reads the manifest from `<toolchain>/node_modules/<package>/package.json` directly).
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules` y `dependency-cruiser` 18.5.0 (fijado en
`gates-kit/toolchains/angular/package.json`).
