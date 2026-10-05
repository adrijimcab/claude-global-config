# dependency-cruiser

dependency-cruiser over the `src/` tree with two error rules: no circular import, and the `core` layer never
imports a `pages` feature (dependencies point from pages to core). The scan is scoped with `includeOnly`; no
exclusion, ignore or allowance of any kind.
@es dependency-cruiser sobre el árbol `src/` con dos reglas de error: ningún import circular, y la capa `core`
nunca importa una feature de `pages` (las dependencias van de pages a core). El escaneo se acota con
`includeOnly`; ninguna exclusión, ignorado ni permiso.

## Sources (from the explore record, engram #1147; not re-fetched)

- https://github.com/sverweij/dependency-cruiser (rules `forbidden`, `circular`, `options.includeOnly`).
- The gap recorded in #1147: the kit had no architecture-boundary gate, and `b100-am-ui` uses madge with
  acyclic gates only. The layer names follow `Discovery-FE/src/app/{core,pages}` (explore record).

## Fixtures

- `pass/src/app/`: `pages/home.ts` imports `core/clock.ts`, the allowed direction.
- `fail/src/app/`: `core/clock.ts` imports `pages/home.ts`, the forbidden direction (`core-not-from-pages`).
  The fixture holds only that defect. `no-circular` was proven apart on a constructed two-file cycle in a
  temporary folder (exit 1, then removed); it is not part of the committed fail fixture, so removing that
  rule from the config would not turn this gate green by itself.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `dependency-cruiser` 18.5.0 (pinned in
`../toolchain/package.json`; the package exposes no `./package.json` export, so `run-tool.mjs` reads the
manifest from `<toolchain>/node_modules/<package>/package.json` directly).
