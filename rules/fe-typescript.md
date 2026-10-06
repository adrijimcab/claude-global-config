---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/tsconfig*.json"
---
# Frontend rules — TypeScript and code quality

Binding when writing or reviewing frontend TypeScript/JavaScript. Loaded only when a matching file is read.
Framework rules: `~/.claude/rules/fe-angular.md`; tests: `~/.claude/rules/fe-testing.md`.

## 1. The TypeScript version is the project's, bounded by its framework

- Use only language features of the TypeScript the project installs (`Profile:` line, or
  `node ~/.claude/project-profile/profile.mjs`). Never raise TypeScript past the framework's peer range: for
  Angular it is `>=5.5 <5.9` (19), `>=5.8 <6.0` (20), `>=5.9 <6.1` (21), `>=6.0 <6.1` (22) — so the
  `typescript@latest` on npm (7.0.2 on 2026-10-06) is not installable in any Angular project of those majors.
- A tsconfig option deprecated in TypeScript 6.0 is migrated when touched, never silenced with
  `ignoreDeprecations` (list and detail: skill `typescript-strict` §6).
- Strict family on, and it stays on: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`,
  `verbatimModuleSyntax` (rationale per flag: skill `typescript-strict` §1). A project without one of them gets
  a finding, not a silent downgrade of the code.

## 2. Types that carry the truth

- No type assertions on values (`x as T`, `<T>x`, `as unknown as T`, postfix `!`): the global
  `type-assertion-guard` refuses adding one. Narrow instead: a type guard, `in`/`typeof`/`instanceof`, a
  discriminated union, `satisfies` to check a literal against a type without widening it. `as const` on
  literals is not an assertion and is fine.
- `unknown`, never `any`, at every boundary (HTTP bodies, `JSON.parse`, storage, `postMessage`, third-party
  callbacks), parsed into a domain type once, at the edge. A schema validator the project already uses (zod,
  valibot, typia) is the parser; do not add a second one.
- Model states as discriminated unions (`{ status: 'loading' } | { status: 'ok'; data: T } | { status: 'error';
  error: E }`), not flags that can contradict; exhaustive `switch` with a `never` default.
- Branded types for ids and units that must not mix (`UserId` vs `OrderId`), produced by ONE validating type
  predicate (`function isUserId(value: string): value is UserId`), which narrows without an `as`.
- `readonly` fields, `readonly T[]`/`ReadonlyArray<T>` parameters, no mutation of inputs; new objects by spread.
- Exported functions and public members declare their return types; locals rely on inference.
- No `enum` in new code where a union of string literals or an `as const` object does the job (a `const enum`
  breaks isolated transpilation); follow the project if it already standardised on enums.
- `import type` for type-only imports (required by `verbatimModuleSyntax`).

## 3. Minimal, legible, one responsibility

- A function does one thing and is named for it; a file owns one concept. Early returns over nested `if`s.
- No dead code, no commented-out code, no speculative parameters or options "for later" (YAGNI); delete
  instead of disabling.
- Name by domain meaning (`overdueInvoices`, not `data2`/`list`/`helper`); booleans read as predicates
  (`isOpen`, `hasAccess`). No abbreviations a newcomer must decode.
- No magic numbers or strings: a named `const` beside its use, or a typed config.
- Pure functions for logic; side effects at the edges (services, effects, handlers), so logic is testable
  without a DOM or a network.
- Errors: never swallowed. `catch` narrows `unknown`, then handles, rethrows with context
  (`new Error('…', { cause })`) or reports to the app's error handler. No empty `catch`, no `console.log` as
  error handling in shipped code; logging goes through the project's logger. User-facing and runtime messages
  follow the project's language convention (the owner's: English then `@es` Spanish).
- Dependencies: prefer the platform and what the project already has; a new package needs a reason, a
  maintained source, and a size check (`npm view <pkg>`); never two libraries for one job.
- Comments explain WHY, not what; public API carries JSDoc (bilingual in the owner's repositories).

## 4. Efficient by default, measured before optimised

- Choose the right structure first: `Map`/`Set` for lookups instead of repeated `array.find` in loops; no
  O(n²) over lists that can grow.
- No work in hot paths that can be done once: precompute, memoise (`computed()` in Angular), debounce input
  handlers that trigger requests, cancel stale requests (`switchMap`, `AbortController`).
- Never block the main thread with long synchronous work; chunk it or move it to a Web Worker.
- Lazy-load routes and heavy, rarely used modules; import what is used (`import { x } from 'lib'`, not a
  namespace that defeats tree-shaking). Bundle budgets are a gate, not a suggestion (skill `web-performance`).
- Optimise only with a measurement (profiler, Lighthouse, bundle analyzer) before and after; state it.

## 5. Security in code (browser side)

- No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval`/`new Function`/string
  `setTimeout` with data that is not a constant. Build DOM with the framework's bindings or `textContent`.
- URLs from data are validated (`new URL()`, allowlisted scheme `https:`/`mailto:`) before reaching `href`,
  `src`, `window.open` or `location`.
- No secrets, tokens or internal hostnames in frontend code or `environment*.ts`: everything shipped to the
  browser is public. Tokens live in `HttpOnly` cookies or memory, never `localStorage`.
- `postMessage`: always a target origin; on receive, check `event.origin` and parse `event.data` as `unknown`.
- CSP, Trusted Types, cookie and CORS detail: skill `frontend-security`. Dependency CVEs: the project's audit
  gate (`~/.claude/gates-kit/tier1-tier3-menu.md`).

## 6. Proof

- A change is done when the project's own gates for the touched files pass (lint with type information,
  `tsc --noEmit`, tests): run them, read the real exit code. Suppressions are forbidden by the owner mandates.
