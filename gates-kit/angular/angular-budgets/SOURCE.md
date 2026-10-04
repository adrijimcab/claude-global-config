# angular-budgets

Static check of the `angular.json` production budgets: each buildable project must declare an error budget
(`maximumError`) for `initial`, `anyComponentStyle` and `anyScript`, and none may be above its cap in
`config.json`. `ng build` is what enforces a budget at build time; this gate guards the declaration it reads,
so a budget cannot be deleted, left warning-only or loosened without going red.
@es Comprobación estática de los presupuestos de producción de `angular.json`: cada proyecto compilable debe
declarar un presupuesto de error para `initial`, `anyComponentStyle` y `anyScript`, y ninguno puede superar
su tope. `ng build` aplica el presupuesto al compilar; este gate vigila la declaración que `ng build` lee.

## Chosen caps and why

`initial` 2mb, `anyComponentStyle` 8kb, `anyScript` 1mb: the `maximumError` values MEASURED in
`Discovery-FE/angular.json` (production budgets, lines 52-66), so the caps are the limits the app already
holds, none loosened. The warning limits (1.3mb, 4kb, 600kb) are not capped: only the error limit fails a build.

## Not measured here (stated)

The gate does not run `ng build`: that needs the full Angular toolchain resolved from the workspace, and
the real size of a bundle is the full chain's job. It proves the declaration, not the bundle size.

## Sources (from the explore record, engram #1147; not re-fetched)

- https://angular.dev/tools/cli/build (budgets: `type`, `maximumWarning`, `maximumError`).

## Fixtures

- `pass/angular.json`: the three budgets with the measured limits.
- `fail/angular.json`: `initial` `maximumError` loosened to 5mb, above the 2mb cap.

## Toolchain

Node only, no packages.
