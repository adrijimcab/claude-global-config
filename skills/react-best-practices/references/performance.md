# Performance

Source: `adrii-docs/skills/vercel-react-best-practices/SKILL.md` (Vercel
Engineering, MIT — 70 rules, 8 categories). Reused almost entirely as-is:
this is prose/pattern guidance rather than a react.dev page, so it's
cited here as a secondary (not primary-source) reference per its own
provenance; react.dev/learn/react-compiler (verified 2026-09-29) is the
correction layer — with the Compiler stable, the `rerender-*` category
below applies **only to codebases without the compiler enabled** (see
`react-compiler.md`). Bundle/rendering/JS categories are compiler-agnostic
and still fully apply.

## 1. Eliminate waterfalls (CRITICAL) — see `data-fetching.md`

## 2. Bundle size (CRITICAL)

- Import directly (`import { Button } from 'lib/button'`), avoid barrel
  files (`import { Button } from 'lib'`) that pull in the whole package
  graph.
- Prefer statically analyzable import/file-system paths — dynamic
  `require(variable)` defeats tree-shaking and broadens server traces.
- `next/dynamic` (or `React.lazy`) for heavy, below-the-fold components.
- Load analytics/logging/third-party scripts after hydration, not
  render-blocking.
- Load a module only when its feature is actually activated (feature
  flag, user action).
- Preload a route/chunk on hover/focus for perceived instant navigation.

## 3–4. Server/client fetching — see `data-fetching.md`

## 5. Re-render optimization (MEDIUM) — **no-compiler codebases only**

If the repo does not run the React Compiler, these are the manual
levers (do not add them where the compiler already runs — see
`react-compiler.md`):

- Don't subscribe to state a component only reads inside a callback —
  read it via a ref or inline at call time instead.
- Extract expensive subtrees into their own memoized component
  (`React.memo`) rather than memoizing individual values.
- Hoist non-primitive default prop values (`const DEFAULT = []`) outside
  the component — a fresh `[]`/`{}` literal every render defeats
  `React.memo`/`useMemo` dependency equality.
- Use primitive values in effect/memo dependency arrays, not new
  object/array literals created every render.
- Subscribe to a derived boolean (`isOpen`) rather than the raw value
  that produces it, when only the boolean matters for re-rendering.
- Functional `setState` (`setCount(c => c + 1)`) for a stable callback
  identity that doesn't need the current value in its closure.
- Lazy `useState` initializer (`useState(() => expensiveInit())`) for
  expensive initial values — a plain `useState(expensiveInit())` runs on
  every render, not just mount.
- Don't wrap a cheap/primitive expression in `useMemo` — the memoization
  overhead can exceed the computation.
- Split one hook with several independent pieces of state into several
  hooks, so an update to one doesn't re-run consumers of the others.
- Move interaction-only logic from an Effect into the event handler
  (this is the same principle as `state-management.md`, point 5).
- `startTransition`/`useTransition` for non-urgent updates.
- `useDeferredValue` to keep an input responsive while an expensive
  render catches up.
- Refs for transient, frequently-changing values that don't need to
  trigger a re-render.
- **Never define a component inside another component's render body** —
  it gets a new identity every render, remounting its whole subtree and
  losing its state.

## 6. Rendering performance (MEDIUM)

- Animate a wrapper `<div>`, not the `<svg>` element itself.
- `content-visibility: auto` for long off-screen lists.
- Extract static JSX outside the component so it isn't recreated every
  render.
- Reduce SVG coordinate precision (fewer decimal places = smaller DOM).
- Client-only data: inline a `<script>` for it rather than
  flash-then-correct; or explicitly `suppressHydrationWarning` for a
  known, intentional mismatch (never to silence a real bug).
- `<Activity>` for cheap show/hide instead of unmount/remount.
- Ternary over `&&` for conditional rendering (`cond && 0` renders a
  literal `0`).
- `useTransition` for loading indicators over ad hoc boolean state.
- Resource hints (`preload`, `preconnect`) for critical assets.
- `defer`/`async` on `<script>` tags.

## 7. JavaScript performance (LOW-MEDIUM)

Batch DOM/CSS writes via a class toggle instead of many `style.x =`
calls; build a `Map` for repeated lookups instead of `Array.find` in a
loop; cache object property access and function results (module-level
`Map`) inside hot loops; cache `localStorage`/`sessionStorage` reads;
combine chained `.filter().map()` into one pass; check `array.length`
before an expensive comparison; return early; hoist `RegExp` literals
out of loops; use a loop for min/max instead of `sort()`; `Set`/`Map` for
O(1) membership checks; `toSorted()` for immutable sorts;
`flatMap` to map+filter in one pass; `requestIdleCallback` for
non-critical deferred work.

## 8. Advanced (LOW)

Don't put a `useEffectEvent` result in an effect's dependency array (it's
designed to be excluded); store frequently-changing event handlers in a
ref instead of recreating the effect that reads them; initialize
app-wide singletons once per app load, not per component mount; a
`useLatest(value)` Hook for a stable ref to an always-current value
inside a stable callback.

## Measuring, not guessing

None of the above is a substitute for measuring: use React DevTools
Profiler, and for user-facing metrics use Lighthouse / Chrome DevTools
MCP (`performance_start_trace` → `performance_analyze_insight`) against
Core Web Vitals (LCP, CLS, INP) — see the Checkable Rules table in the
main `SKILL.md`.
