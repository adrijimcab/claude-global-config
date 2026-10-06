---
name: angular-best-practices
description: >
  Angular architecture and API guidance GATED BY THE PROJECT'S REAL MAJOR (19, 20, 21, 22): what exists,
  what is stable, experimental or deprecated in that major, its official migrations and update-guide actions,
  and idiomatic code for it; plus cross-version architecture (standalone, feature folders, route-level DI,
  signals, control flow, SSR/hydration, @defer, NgOptimizedImage, sanitization, CDK a11y, harness tests).
  Trigger: writing, reviewing, refactoring or updating Angular components, directives, services, pipes,
  templates, routes, app.config.ts, angular.json or SSR files.
paths: "**/angular.json,**/src/app/**/*.ts,**/projects/*/src/**/*.ts,**/*.component.ts,**/*.directive.ts,**/*.pipe.ts,**/*.service.ts,**/*.routes.ts,**/app.config*.ts,**/*.html,**/server.ts"
license: MIT
metadata:
  version: "2.0"
  angular_range: "19-22"
  evidence: "angular/angular + angular-cli branches 19.2.x/20.3.x/21.2.x/22.2.x and npm view, measured 2026-10-06"
---

# Angular best practices, by major

## Step 0 — find the major, then read ONE version file

1. The SessionStart line `Profile: Angular <major>.<minor> ...` gives it; otherwise run
   `node ~/.claude/project-profile/profile.mjs` (reads the installed `@angular/core`; never assume the newest).
2. Angular 21+: read `node_modules/@angular/core/resources/best-practices.md` FIRST (official rules for that
   exact version, shipped inside `@angular/core`), then `versions/v<major>.md` (only the delta it lacks).
   Angular 19/20: `versions/v<major>.md` is the full source.
3. Apply the matching column of `~/.claude/rules/fe-angular.md` (the cross-major matrix). An API that is EXP or
   DP in the project's major is not used unless the project already depends on it or the owner decides it.
4. Updating a major: read the TARGET major's file ("Updating to N"), one hop at a time.

| Major | File | Official rules file in `@angular/core` | Docs source for that major |
|---|---|---|---|
| 19 | [versions/v19.md](versions/v19.md) | no | `github.com/angular/angular/tree/19.2.x/adev/src/content` |
| 20 | [versions/v20.md](versions/v20.md) | no (MCP `get_best_practices` serves a copy) | `.../tree/20.3.x/adev/src/content` |
| 21 | [versions/v21.md](versions/v21.md) | yes | `.../tree/21.2.x/adev/src/content` |
| 22 | [versions/v22.md](versions/v22.md) | yes | `.../tree/22.2.x/adev/src/content` (= angular.dev) |

Outside 19-22: below 19, read `versions/v19.md` as the upgrade target; above 22, the official file is the
source and `versions/v22.md` may be stale.

## Cross-version architecture (true in every supported major)

- **Standalone everything** (default since 19; never write `standalone: true`). NgModules only where a
  dependency forces them.
- **Feature folders, one concept per file**; no transversal `components/`, `services/` folders.
- **Container/presentational**: a container injects and orchestrates; presentational components only take
  `input()`s and emit `output()`s, hold no services, and are trivially testable.
- **`inject()` over constructor injection**; inject a contract (`InjectionToken` for a port/repository) when
  the consumer may need a swap or a test double; built-ins and genuine root singletons are injected directly.
- **Route-level DI**: `app.config.ts` holds only what the shell needs (router, HTTP, interceptors, error
  handling); feature services go in the lazy route's `providers`. The root route is `loadComponent`, never an
  eager `component`.
- **Signals for state**, `computed()` for derivations; `effect()` only where the major has it stable
  (20+) and only for side effects that leave Angular. An `effect()` is created in an injection context
  (constructor, field initialiser, `runInInjectionContext`), never inside `afterNextRender`, `ngOnInit`,
  observer callbacks or timers (NG0203).
- **Signal fields `readonly`**: a reassigned signal is no longer the one the template subscribed to.
- **Templates**: `@if`/`@for` (with a stable `track`)/`@switch`; `[class]`/`[style]` bindings; no logic that
  belongs in `computed()`; host bindings in `host: {}` metadata.
- **Zoneless-ready code in every major**: change notification through signals, `markForCheck()`, the async
  pipe or template listeners; no reliance on `NgZone.onMicrotaskEmpty`/`onStable` (they never fire zoneless);
  `NgZone.run`/`runOutsideAngular` are harmless and stay for zone apps; `PendingTasks` marks async work SSR
  must wait for.
- **Libraries never `@defer` their own internals**: deferring is the consuming app's decision (an internal
  `@defer` breaks `viewChild.required` in `ngAfterViewInit`, consumer templates and SSR harnesses).

## SSR, hydration, CSP

- `provideClientHydration()`; event replay (`withEventReplay()`); incremental hydration per the major's
  status (see the version file: DP in 19, opt-in in 20/21, default in 22).
- Under a strict CSP (`style-src` without `'unsafe-inline'`), `[style.x]` bindings are serialised as inline
  `style=""` by the server and blocked; use classes for discrete states and CSS custom properties set after
  hydration for continuous values.
- Elements created in code for the server DOM use `setAttribute('href', url)`, not the IDL property (the
  server does not serialise property assignments); preload links are browser-facing URLs and are removed on
  destroy (SPA navigation keeps `<head>` nodes).
- Detail: [references/ssr-hydration-performance.md](references/ssr-hydration-performance.md).

## Performance

- `@defer` with an explicit trigger for heavy, below-the-fold UI in apps; `prefetch on` separated from render.
- `NgOptimizedImage` for raster images (`priority` on the LCP image), `angular.json` budgets as a failing gate.
- `@for` `track` by identity; `computed()` for expensive derivations; OnPush (explicit before 22).
- Core Web Vitals: skill `web-performance`.

## Security

- Angular sanitizes by context; `DomSanitizer.bypassSecurityTrust*` only for values built from trusted input,
  reviewed, beside the reason. Strict CSP with nonces (or `security.autoCsp` for static hosting), Trusted Types
  policies `angular`/`angular#unsafe-bypass`; XSRF through `HttpClient` stays on. Detail: skill
  `frontend-security`.

## Accessibility and testing

- CDK a11y: `FocusTrap`, `LiveAnnouncer`, `FocusMonitor`, `ListKeyManager`/`ActiveDescendantKeyManager`;
  patterns from skill `web-accessibility`.
- Tests through component harnesses; custom harnesses compose Material harnesses (`locatorFor(MatXHarness)`),
  never internal `.mat-mdc-*` classes; overlays through `documentRootLoader`. Rules:
  `~/.claude/rules/fe-testing.md`.
- ESLint `strict-type-checked` flags the official `Validators.required` reference style as
  `unbound-method`: the fix is a scoped, justified rule change in the project config, never a disable comment.

## References

- [references/signals-and-reactivity.md](references/signals-and-reactivity.md) — signal APIs in depth.
- [references/ssr-hydration-performance.md](references/ssr-hydration-performance.md) — SSR, `@defer`, images.
- [references/gate-table.md](references/gate-table.md) — rule → tool table (written for b100-am-ui; its
  `@base100/eslint-plugin` rows are that project's, the angular-eslint and TS rows are general).
- [references/official-agent-skills.md](references/official-agent-skills.md) — verdict on Angular's own
  `angular/skills` package versus this skill.
- Executable gates: `~/.claude/gates-kit/angular.md`.
