# dependency-cruiser-circular

dependency-cruiser over the `src/` tree with one error rule: no circular import. The scan is scoped with
`includeOnly`; no exclusion, ignore or allowance of any kind. The sibling gate `dependency-cruiser-layering`
owns the layer-direction rule.
@es dependency-cruiser sobre el árbol `src/` con una regla de error: ningún import circular. El escaneo se
acota con `includeOnly`; ninguna exclusión, ignorado ni permiso. El gate hermano `dependency-cruiser-layering`
se ocupa de la dirección entre capas.

## Sources (from the explore record, engram #1147; not re-fetched)

- https://github.com/sverweij/dependency-cruiser (the `circular` condition of a `forbidden` rule).
- The gap recorded in #1147: the kit had no architecture-boundary gate, and `b100-am-ui` uses madge with
  acyclic gates only.

## Fixtures

- `pass/src/app/`: `total.ts` imports `leaf.ts`, which imports nothing.
- `fail/src/app/`: `leaf.ts` and `total.ts` import each other, a two-file cycle. If the rule is removed from
  `config.cjs` the fail fixture exits 0 and the verifier reports the gate red.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `dependency-cruiser` 18.5.0 (pinned in
`gates-kit/toolchains/angular-<major>/package.json`, every major).
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules` y `dependency-cruiser` 18.5.0 (fijado en
`gates-kit/toolchains/angular-<major>/package.json`, en cada major).
