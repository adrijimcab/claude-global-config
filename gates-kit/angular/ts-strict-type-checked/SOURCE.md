# ts-strict-type-checked

Runs the typescript-eslint `strict-type-checked` preset with type information (`projectService`) and
`--max-warnings 0`. No rule is changed, downgraded or scoped out; `files` selects `**/*.ts`.
@es Corre el preset `strict-type-checked` de typescript-eslint con información de tipos y
`--max-warnings 0`. Ninguna regla se cambia, degrada ni se excluye; `files` elige `**/*.ts`.

## Sources (from the explore record, engram #1147; not re-fetched)

- https://typescript-eslint.io/users/configs (the `strict-type-checked` preset and its rule list).

## Fixtures

- `pass/label.ts`: `value ?? 'none'` over `string | undefined`, a condition the types can fail.
- `fail/label.ts`: `value !== undefined` over a `string`, which is always true, so the preset's
  `@typescript-eslint/no-unnecessary-condition` (a rule present in `strict-type-checked` and absent from
  `recommended`) exits 1. Each side carries its own `tsconfig.json` for the project service.

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `eslint` and `typescript-eslint`
(measured with typescript-eslint 8.57.1, eslint 9.39.4, typescript 5.5.4). Without it the launcher exits 3.
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules` (eslint y typescript-eslint). Sin él el
lanzador sale con 3.
