# angular-budgets

Static check of the `angular.json` production budgets: each buildable project must declare an error budget
(`maximumError`) for `initial`, `anyComponentStyle` and `anyScript`, and none may be above its cap in
`config.json`. `ng build` is what enforces a budget at build time; this gate guards the declaration it reads,
so a budget cannot be deleted, left warning-only or loosened without going red.
@es Comprobación estática de los presupuestos de producción de `angular.json`: cada proyecto compilable debe
declarar un presupuesto de error para `initial`, `anyComponentStyle` y `anyScript`, y ninguno puede superar
su tope. `ng build` aplica el presupuesto al compilar; este gate vigila la declaración que `ng build` lee.

Exit codes: 0 every budget present and within its cap; 1 a problem (a missing, invalid or over-cap budget);
2 nothing could be measured: no readable `angular.json` with a buildable project, or an unreadable `config.json`
or a cap in it that is not a size (a kit defect, never a pass). Every budget of a type is compared with its cap,
not only the first one.
@es Códigos de salida: 0 todo presupuesto presente y dentro de su tope; 1 un problema (presupuesto ausente,
inválido o sobre su tope); 2 no se pudo medir nada: sin `angular.json` legible con un proyecto compilable, o un
`config.json` ilegible o con un tope que no es un tamaño (un defecto del kit, nunca un aprobado). Se compara CADA
presupuesto de un tipo con su tope, no solo el primero.

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
