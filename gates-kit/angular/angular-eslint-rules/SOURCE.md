# angular-eslint-rules

angular-eslint rules gated by the Angular major of the installed toolchain: experimental and developer-preview
APIs are forbidden by default (`no-experimental`, `no-developer-preview`), and the "prefer" rules are on only
from the major whose official guidance asks for what they enforce. The table and its reasons live in
`gates-kit/angular-lint-rules.mjs`; `config.mjs` reads the major from the installed `angular-eslint` (its major
moves with Angular's) and turns that major's rules on as errors, typed for `.ts` and with the template parser
for `.html`. A major the table does not cover stops the config, so the gate goes red instead of grading with a
near major's rules.
@es Reglas de angular-eslint según la major de Angular de la toolchain instalada: las APIs experimentales y en
developer preview se prohíben por defecto, y las reglas "prefer" solo se activan desde la major cuya guía
oficial pide lo que imponen. La tabla y sus motivos están en `gates-kit/angular-lint-rules.mjs`; `config.mjs`
lee la major del `angular-eslint` instalado y activa sus reglas como errores. Una major fuera de la tabla
detiene la config y el gate sale en rojo.

## The rules per major

| Rule | 19 | 20 | 21 | 22 |
|---|---|---|---|---|
| `prefer-signals` | on | on | on | on |
| `no-experimental` | absent from plugin 19.8.1 | on | on | on |
| `no-developer-preview` | absent from plugin 19.8.1 | on | on | on |
| `prefer-inject` | off: the 19 style guide shows constructors | on | on | on |
| `prefer-host-metadata-property` | absent from 19.8.1; the 19 guide says "consider @HostBinding" | on | on | on |
| `template/prefer-control-flow` | off: `NgIf`/`NgFor` deprecated only from 20.0 | on | on | on |
| `prefer-service-decorator` | absent | absent | absent from 21.4.0 | on (`@Service()` exists from 22.0) |

"absent" was read from the rule tables of each installed `@angular-eslint/eslint-plugin` and
`-template` (19.8.1, 20.7.0, 21.4.0, 22.5.0). OnPush (`prefer-on-push-component-change-detection`, 19 to 21
only, since 22 makes OnPush the default) is not in the table yet: it was not asked for.

## Measured (2026-10-06, Node 22.22.0)

`pass/` exits 0 on all four toolchains. `fail/` exits 1 on all four, each with exactly its major's rules:

- `angular-19`: 1 error, `prefer-signals` (the `@Input()`).
- `angular-20`, `angular-21`: 6 errors, `prefer-signals`, `prefer-host-metadata-property`, `prefer-inject`,
  `no-developer-preview` (`previewLabel`), `no-experimental` (`previewTotal`), `template/prefer-control-flow`
  (`*ngIf`).
- `angular-22`: the same 6 plus `prefer-service-decorator` (`@Injectable({ providedIn: 'root' })`), 7 errors.

## Sources (not re-fetched)

- Angular research of 2026-10-06 over angular/angular branches 19.2.x to 22.2.x (section 4 "Rule-gating cheat
  sheet" and its lint guard rails): style guide `inject()` from 20, `host` over `@HostBinding`, control flow
  over structural directives from 20, `@Service()` from 22, EXP/DP APIs forbidden by default.
- https://github.com/angular-eslint/angular-eslint (rule docs; `no-experimental` and `no-developer-preview`
  read the JSDoc tags `@experimental` and `@developerPreview` of the symbol a file uses, through type
  information).

## Fixtures

- `fail/preview.ts` declares two local functions tagged `@experimental` and `@developerPreview`: the rules read
  the tag of the used symbol, so the fixture needs no `@angular/core` installed.
- `fail/total.component.ts` breaks every TypeScript rule once; `fail/total.component.html` uses `*ngIf`;
  `fail/clock.service.ts` is an `@Injectable({ providedIn: 'root' })` root singleton.
- `pass/` is the same component written the way 22's guidance asks: `input()`, `host` metadata, `@if`, no
  tagged API, no root `@Injectable`.
- `@angular/core` is not installed, so its imports have no types; no rule of the table depends on them (the
  decorator and signal rules read the syntax).

## Toolchain

`GATES_KIT_TOOLCHAIN` names the directory holding `node_modules` with `eslint`, `typescript-eslint` and
`angular-eslint` (pinned per major in `gates-kit/toolchains/angular-<major>/package.json`). Without it the
launcher exits 3. `--format stylish` is named so the report does not depend on a default; `--quiet` is
refused by `gate-command-rules.mjs`.
@es `GATES_KIT_TOOLCHAIN` indica el directorio con `node_modules`, `eslint`, `typescript-eslint` y
`angular-eslint` (fijados por major en `gates-kit/toolchains/angular-<major>/package.json`). Sin él el lanzador
sale con 3. `--format stylish` se nombra para que el informe no dependa de un valor por defecto; `--quiet` lo
rechaza `gate-command-rules.mjs`.
