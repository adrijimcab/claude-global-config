---
paths:
  - "**/angular.json"
  - "**/src/app/**/*.ts"
  - "**/projects/*/src/**/*.ts"
  - "**/*.component.ts"
  - "**/*.directive.ts"
  - "**/*.pipe.ts"
  - "**/*.service.ts"
  - "**/*.routes.ts"
  - "**/app.config*.ts"
  - "**/*.html"
---
# Frontend rules — Angular, gated by the project's real major

Binding when writing or reviewing Angular code. The harness loads this file only when a matching file is read.
Version facts come from `angular/angular` and `angular/angular-cli` sources on the 19.2.x/20.3.x/21.2.x/22.2.x
branches and `npm view`, measured 2026-10-06; the per-major detail and citations are in
`~/.claude/skills/angular-best-practices/versions/v<major>.md`.

## 0. Which column applies

- The SessionStart line `Profile: Angular <major>.<minor> ...` names the column. Without it, run
  `node ~/.claude/project-profile/profile.mjs` (reads `node_modules`; never guess from memory or from the newest
  docs). A `(declared, not installed)` version is the lower bound of the range: install before relying on it.
- Apply ONLY what exists up to the project's major. An API newer than the project is not "the modern way", it
  is a compile error or an experimental dependency.
- Angular 21+: `node_modules/@angular/core/resources/best-practices.md` is the official rule set for that exact
  version; read it first. This file and the version file carry only what it lacks (gating, migrations,
  deprecations, project conventions). Angular 19/20: no official file ships; the version file is the source.
- `EXP` (experimental) and `DP` (developer preview) APIs are FORBIDDEN by default: they change between minors.
  Use one only when the project already depends on it or the owner decides it, stated in the change. Gate:
  angular-eslint `no-experimental` + `no-developer-preview` (present in the 20.7.0 and 21.4.0 plugins, absent in
  19.8.1: on 19 this is a review item). The angular-eslint major matches the Angular major.

## 1. The matrix (cell = what to do; `-` = does not exist)

| Topic | 19 | 20 | 21 | 22 |
|---|---|---|---|---|
| Support (2026-10-06) | EOL since 2026-05-19 | LTS to 2026-11-28 | LTS to 2027-06 | active to 2027-06 |
| TypeScript (compiler-cli peer) | `>=5.5 <5.9` | `>=5.8 <6.0` | `>=5.9 <6.1` (`@angular/build` peers `<6.0`: stay on 5.9) | `>=6.0 <6.1` |
| Node | `^18.19.1 \|\| ^20.11.1 \|\| >=22` | `^20.19 \|\| ^22.12 \|\| >=24` | same as 20 | `^22.22.3 \|\| ^24.15 \|\| >=26` |
| `standalone: true` | omit (default) | omit | omit | omit |
| `changeDetection: OnPush` | write it | write it | write it | omit (default); `Eager` only on purpose |
| Change detection default | zone.js | zone.js | zoneless | zoneless |
| Zoneless | EXP: avoid | DP in 20.0-20.1; `provideZonelessChangeDetection()` STABLE from 20.2 | default; a zone app needs `provideZoneChangeDetection()` | default |
| `signal`/`computed` | stable | stable | stable | stable |
| `input()`/`output()`/`model()`, signal queries | stable | stable | stable | stable; `model()` over an input+output pair |
| `effect()` | DP: avoid | stable, last resort | same | same |
| `linkedSignal()` | DP: avoid | stable | stable | stable |
| `resource`/`rxResource`/`httpResource` | EXP: avoid | EXP: avoid | EXP: avoid | stable |
| Signal Forms | - | - | EXP: avoid | stable; prefer for NEW forms |
| `@Service()` | - | - | - | stable; prefer for new root singletons |
| After-render hook | `afterRender` (DP) | `afterEveryRender`/`afterNextRender` stable | same | same |
| `toSignal`/`toObservable` | DP | stable | stable | stable |
| `@if`/`@for`/`@switch`, `@defer`, `@let` | stable | stable | stable | stable |
| `*ngIf`/`*ngFor`/`*ngSwitch` | allowed; prefer control flow | deprecated | deprecated | deprecated |
| `ngClass`/`ngStyle` | prefer `[class]`/`[style]` | same | same + migrations | same |
| Host bindings | `host: {}` metadata (the legacy 19 style guide's "consider @HostBinding" is superseded) | `host: {}` | same | same |
| DI | `inject()` | `inject()` | `inject()` | `inject()` |
| HTTP backend | XHR default; add `withFetch()` for SSR | same | same | Fetch default: omit `withFetch()` (deprecated); `withXhr()` only for upload progress |
| Incremental hydration | DP: avoid | stable: `withIncrementalHydration()` | same | default: omit it (deprecated) |
| Route render mode (SSR) | DP | stable: `provideServerRendering(withRoutes(...))` | same | same |
| Builder | `@angular-devkit/build-angular:application` | `@angular/build:application` | same | same; webpack builders deprecated |
| `ng new` test runner | Karma+Jasmine | Karma+Jasmine (Vitest builder EXP) | Vitest | Vitest |
| Generated file names | `user-profile.component.ts` | `user-profile.ts` | `fileNameStyleGuide` (default `2025`) | `user-profile.ts` |
| `?.` result in templates | `null` | `null` | `null` | `undefined` |
| Template arrow functions | no | no (official rules forbid) | expression body from 21.2 | yes |
| `strictTemplates` default | project setting | project setting | project setting | `true` |
| `ng mcp` (CLI MCP server) | - | from CLI 20.1 (docs: experimental) | yes | yes, `--root` added |
| Official rules file in `@angular/core` | - | - | `resources/best-practices.md` | same |

## 2. Project conventions beat generator defaults

- File naming follows the files that exist. A 19 project, or one on `fileNameStyleGuide: "2016"`, keeps
  `x.component.ts`; a 20+ project with suffix-less files keeps that. Never mix styles in one feature.
- The test runner in use stays. Never switch Karma to Vitest as a side effect: the migration
  (`migrate-karma-to-vitest` in 22, `refactor-jasmine-vitest` in 21) is its own decided change; the
  Vitest migration guide still calls it experimental.
- A project's own lint plugin and AGENT-CONTRACT override this file where they are stricter.

## 3. Always (every supported major)

- Standalone components, feature folders (not `components/`, `services/` by type), one concept per file;
  presentation-only components; complex template logic moved to `computed()`.
- State in signals; derived state in `computed()`; `effect()` only for side effects that leave Angular
  (logging, storage, canvas/third-party DOM) and never to copy one signal into another. Never `mutate`.
- `readonly` on `input`/`model`/`output`/queries and signal fields; `protected` for template-only members.
- `@for` always has a stable `track` (an id, never `$index` for reorderable data); `@empty` for empty lists.
- `class`/`style` bindings, not `ngClass`/`ngStyle`; no `CommonModule` imports in standalone components.
- `NgOptimizedImage` (`ngSrc`, width/height or `fill`, `priority` on the LCP image) for raster images.
- Lazy-load feature routes (`loadComponent`/`loadChildren`); route-level providers for feature services,
  `app.config.ts` keeps only what the shell needs.
- Reactive forms (typed) over template-driven where Signal Forms are not available or not stable (§1).
- Async pipe or `toSignal` for observables in templates; no manual `subscribe` without
  `takeUntilDestroyed()` or a `DestroyRef`.
- No globals in templates (`new Date()`, `window`), no function calls that do work in bindings: `computed()`.
- Security: Angular sanitizes bindings by context. `DomSanitizer.bypassSecurityTrust*` only on a value built
  from trusted input, beside its justification, never on user or API text; no `innerHTML` with unsanitized
  HTML; no `ElementRef.nativeElement` writes of HTML. Details: skill `frontend-security`.
- Accessibility: templates pass angular-eslint template a11y rules and AXE at WCAG 2.2 AA; interactive custom
  widgets follow the APG pattern (skill `web-accessibility`).
- Errors reach `ErrorHandler`; handle the errors of your own calls; a `resource` exposes its error state.

## 4. Updating a major

- One major at a time, with `ng update @angular/core@<n> @angular/cli@<n>` and the update guide's actions for
  that hop; the exact migrations and guide actions are in `versions/v<n>.md`. Raise TypeScript and Node to the
  new major's range in the same change (§1), never past it.
- Run the project's own full gate chain after the hop; a migration's diff is reviewed like hand-written code.

## 5. Where the rest lives

- Architecture, signals, SSR/hydration, `@defer`, CDK a11y and harness testing detail: skill
  `angular-best-practices` (its `versions/` folder is per major).
- TypeScript strictness: `~/.claude/rules/fe-typescript.md` and skill `typescript-strict`.
- Tests: `~/.claude/rules/fe-testing.md`. Core Web Vitals and budgets: skill `web-performance`.
- Executable gates for Angular (lint, strict templates, budgets, boundaries): `~/.claude/gates-kit/angular.md`.
