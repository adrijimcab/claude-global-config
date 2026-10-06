# ts-strict-type-checked

Runs the typescript-eslint `strict-type-checked` preset with type information (`projectService`) and
`--max-warnings 0`. No rule is changed, downgraded or scoped out; `files` selects `**/*.ts`. This is the
"lint with typescript-eslint strict-type-checked" gate of `templates/nest-api/AGENT-CONTRACT.md` (G3).
@es Corre el preset `strict-type-checked` de typescript-eslint con información de tipos y
`--max-warnings 0`. Ninguna regla se cambia, degrada ni se excluye; `files` elige `**/*.ts`. Es el gate "lint
con typescript-eslint strict-type-checked" de `templates/nest-api/AGENT-CONTRACT.md` (G3).

## Sources (not re-fetched)

- `templates/nest-api/AGENT-CONTRACT.md` G3 (the gate list of the stack) and `tier1-tier3-menu.md` #5 (strict
  TypeScript catches null/undefined access and unsound indexing).
- https://typescript-eslint.io/users/configs (the `strict-type-checked` preset and its rule list).
- The gate is the one `angular/ts-strict-type-checked` runs: the preset is stack-neutral, so the config and
  fixtures are the same, kept in this folder so a project copies one self-contained gate.

## Fixtures

- `pass/label.ts`: `value ?? 'none'` over `string | undefined`, a condition the types can fail.
- `fail/label.ts`: `value !== undefined` over a `string`, which is always true, so the preset's
  `@typescript-eslint/no-unnecessary-condition` (present in `strict-type-checked`, absent from `recommended`)
  exits 1. Each side carries its own `tsconfig.json` for the project service.

## Not measured here (stated)

No Nest repository was measured for this gate: the preset is applied whole, never tuned to a codebase.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `eslint` and `typescript-eslint`
(pinned in `gates-kit/toolchains/nest/package.json`). Without it the launcher exits 3.
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules` (eslint y typescript-eslint, fijados en
`gates-kit/toolchains/nest/package.json`). Sin él el lanzador sale con 3.
