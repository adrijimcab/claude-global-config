---
name: react-best-practices
description: >
  Trigger: writing, reviewing or refactoring React components, hooks, forms,
  Server/Client Components, data fetching, error boundaries, Suspense, or
  React tests (Testing Library/Vitest). Also trigger on useEffect/useMemo/
  useCallback usage, prop-drilling, boolean-prop proliferation, or folder
  structure questions for a React app. Canonical React 19 architecture,
  state, performance and a11y rules sourced from react.dev, with the
  checkable lint/CI gate for each rule.
when_to_use: >
  Use when the user asks "how should I structure this component", "do I
  need useEffect here", "should this be a Server or Client Component",
  "how do I handle this form", "why is this re-rendering", or asks for a
  React code review against current (React 19 / Compiler-era) best practice.
paths: "**/*.tsx,**/*.jsx,**/hooks/**/*.ts,**/hooks/**/*.tsx"
license: Apache-2.0
metadata:
  author: adrian-jimenez
  version: "1.0"
  sources: "react.dev (verified 2026-09-29, React 19.3.0 stable)"
---

# React Best Practices (React 19, Compiler-era)

## Activation Contract

Load this skill for any `.tsx`/`.jsx` component or hook file, or when the
task is architectural (component split, state placement, Server vs Client,
forms, data fetching, error handling, performance, a11y, or testing) in a
React codebase. For Next.js App Router-specific routing/caching/metadata
work, also load `nextjs-app-router`.

## Hard Rules

1. **Never write `useMemo`/`useCallback`/`React.memo` to fix a re-render**
   in a codebase that runs the React Compiler. Let the compiler memoize;
   hand-written memoization the compiler cannot verify is flagged by
   `eslint-plugin-react-hooks`'s `preserve-manual-memoization` /
   `use-memo` rules. Manual memoization is only for codebases that opted
   out of the compiler. (react.dev/learn/react-compiler)
2. **Never call a Hook conditionally, in a loop, or after an early
   `return`.** Only top level of a component/custom Hook.
   (react.dev/reference/rules/rules-of-hooks)
3. **Never fetch data, subscribe, or set state "because a value changed"
   inside `useEffect` when the value can be derived during render.**
   Compute during render, or reach for `useMemo` for expensive
   computations. Only use `useEffect` to synchronize with a system
   outside React. (react.dev/learn/you-might-not-need-an-effect)
4. **Never mutate props, state, or anything read during render** (purity
   rule) — the compiler's `immutability`/`purity` lint rules depend on it.
5. **A Server Component never imports a Client-only API** (`useState`,
   `useEffect`, event handlers, `window`). Add `"use client"` at the top of
   the file that needs interactivity, as high in the tree as necessary and
   no higher. (react.dev/reference/rsc/server-components)
6. **Every list item needs a stable, unique `key`** — never the array
   index for a list that can reorder/filter/insert.
7. **Error boundaries only catch render errors**, not event handlers, not
   async callbacks, not SSR. Handle those with try/catch or the
   action's own error state. (react.dev/reference/react/Component)

## Decision Gates

### Where does this state live?

| Situation | Put it in |
|---|---|
| Only this component reads/writes it, resets on unmount | `useState`/`useReducer` in the component |
| Derivable from props/state already available | Nothing — compute during render (`const x = …`), or `useMemo` only if the computation is measurably expensive |
| Several sibling components need to read/write it | Lift to closest common parent (react.dev/learn/thinking-in-react, step 4) |
| It's the current URL/filter/page/tab and should survive refresh or be shareable | URL (`searchParams`/route param), not React state |
| It's server-owned data (DB rows, session) | Server state: fetch in a Server Component / route handler / server function; do not mirror it into client `useState` unless the user is editing an optimistic copy (`useOptimistic`) |
| Logic (not the state value) is reused across components | Extract a custom Hook (`use*`) that *encapsulates* the state; each call still gets independent state (react.dev/learn/reusing-logic-with-custom-hooks) |

### Do I need `useEffect`?

Default answer: **no**. Reach for it only to synchronize with something
outside React (subscribe to a browser API, a non-React widget, a
WebSocket). For every other case, see the table in
`references/state-management.md` (derived state, resetting state via
`key`, adjusting state on prop change, event-driven logic, chained
computations). Source: react.dev/learn/you-might-not-need-an-effect.

### Server Component or Client Component?

| Need | Use |
|---|---|
| Read a DB/file/secret, no interactivity | Server Component (default, no directive) |
| `useState`/`useEffect`/`useContext`/refs | Client Component (`"use client"`) |
| `onClick`/`onChange`/any DOM event handler | Client Component |
| Browser-only API (`window`, `localStorage`, `IntersectionObserver`) | Client Component |
| A mutation the user triggers (form submit, button) | Server Function (`"use server"`) invoked via a Client Component's form/action, or from a Server Component's `<form action={fn}>` |

### Composition, not boolean props

When a component grows a 3rd/4th boolean prop to switch behavior
(`isCompact`, `isModal`, `hideFooter`…), stop and use composition instead:
compound components sharing context, explicit variant components, or
`children` instead of `renderX` props. See
`references/component-architecture.md` (adapted from
`adrii-docs/skills/vercel-composition-patterns/SKILL.md`).

## Checkable Rules → Enforcing Tool

| Rule | Enforcing tool | Config/rule id |
|---|---|---|
| Only call Hooks at the top level | `eslint-plugin-react-hooks` v7.1.1 | `react-hooks/rules-of-hooks` (in `recommended`) |
| Effect dependency array must be exhaustive | `eslint-plugin-react-hooks` | `react-hooks/exhaustive-deps` (in `recommended`) |
| No `setState` during render (outside the one-shot "adjust state on prop change" pattern) | `eslint-plugin-react-hooks` (Compiler rules) | `react-hooks/set-state-in-render` (`recommended-latest`) |
| No `setState` synchronously in an Effect without a guard (causes extra render / loop risk) | `eslint-plugin-react-hooks` | `react-hooks/set-state-in-effect` (`recommended-latest`) |
| No mutating props/state/anything read during render | `eslint-plugin-react-hooks` | `react-hooks/immutability`, `react-hooks/purity` (`recommended-latest`) |
| Don't hand-write `useMemo`/`useCallback` the compiler already covers, don't fight the compiler's memoization | `eslint-plugin-react-hooks` | `react-hooks/use-memo`, `react-hooks/preserve-manual-memoization` (`recommended-latest`) |
| Component defined at module scope, not re-created every render | `eslint-plugin-react-hooks` | `react-hooks/static-components` (`recommended-latest`) |
| Refs read/written only where allowed (not during render) | `eslint-plugin-react-hooks` | `react-hooks/refs` (`recommended-latest`) |
| Syntax the Compiler can't safely optimize | `eslint-plugin-react-hooks` | `react-hooks/unsupported-syntax` (`recommended-latest`) |
| Library known to break Compiler assumptions | `eslint-plugin-react-hooks` | `react-hooks/incompatible-library` (`recommended-latest`) |
| An async function passed where a sync `void` callback (e.g. `onClick`) is expected | `typescript-eslint` v8.71.0 | `@typescript-eslint/no-misused-promises` (`checksVoidReturn`) |
| A Promise created and never awaited/handled | `typescript-eslint` | `@typescript-eslint/no-floating-promises` |
| Type-only imports use `import type` (keeps RSC/client boundary and bundle clean) | `typescript-eslint` | `@typescript-eslint/consistent-type-imports` |
| Images have alt text, buttons/links are keyboard-operable, form inputs have labels, ARIA attrs are valid | `eslint-plugin-jsx-a11y` v6.10.2 | `recommended` config (31 rules: `alt-text`, `label-has-associated-control`, `click-events-have-key-events`, `no-noninteractive-element-interactions`, `role-has-required-aria-props`, …) |
| Component/page passes Core Web Vitals (LCP/CLS/INP), has no console errors | Lighthouse / Chrome DevTools MCP (`performance_start_trace`, `performance_analyze_insight`, `lighthouse_audit`) | CI budget on LCP/CLS/TBT |
| Test asserts observable behavior, not implementation | `@testing-library/react` + ESLint `eslint-plugin-testing-library` | `testing-library/no-node-access`, `testing-library/no-container` |

## Topic Quick-Reference → `references/`

- **Component architecture** (composition, colocation, the modern
  replacement for container/presentational) → `references/component-architecture.md`
- **State: local vs lifted vs server vs URL, when not `useEffect`** →
  `references/state-management.md`
- **React Compiler & memoization** → `references/react-compiler.md`
- **Server vs Client Components** → `references/server-client-components.md`
- **Forms & Actions** (`useActionState`, `useFormStatus`, `useOptimistic`)
  → `references/forms-and-actions.md`
- **Data fetching** (`use()`, `React.cache`, waterfalls) →
  `references/data-fetching.md`
- **Error boundaries & Suspense** → `references/error-boundaries-and-suspense.md`
- **Performance** (re-renders, bundle, rendering) → `references/performance.md`
- **Accessibility** → `references/accessibility.md`
- **Testing** (Testing Library philosophy, Vitest) → `references/testing.md`
- **Folder structure** → `references/folder-structure.md`

## Execution Steps

1. Identify the topic(s) the task touches from the table above; read only
   the matching `references/*.md` file(s) — don't load all of them.
2. Apply the Decision Gates before writing code: state location, Server
   vs Client, `useEffect` necessity, composition vs boolean props.
3. Write the component/hook. Do not add manual memoization unless the
   repo has confirmed it does not run the React Compiler.
4. Cross-check the diff against the Checkable Rules table; if a project's
   ESLint config is missing one of those rules/configs, say so instead of
   silently relying on it.
5. For tests, follow `references/testing.md` (behavior-first, Testing
   Library queries, no implementation details).

## Output Contract

When asked to review or write React code, report: which Decision Gate
applied (state location / Server-Client / effect-or-not), which Hard
Rule(s) were at risk, and which Checkable Rule/tool would catch a
regression if the gate were violated.

## References

- Primary sources (fetched/verified 2026-09-29): react.dev (Rules of
  Hooks, You Might Not Need an Effect, React Compiler, Server Components,
  Server Functions, Suspense, Thinking in React, Reusing Logic with Custom
  Hooks, Component#error-boundaries), npm registry for
  `eslint-plugin-react-hooks@7.1.1`, `typescript-eslint@8.71.0`,
  `eslint-plugin-jsx-a11y@6.10.2`, `react@19.3.0`.
- Reused with attribution and updated: `adrii-docs/skills/react-19/SKILL.md`,
  `adrii-docs/skills/vercel-react-best-practices/SKILL.md`,
  `adrii-docs/skills/vercel-composition-patterns/SKILL.md` — see each
  `references/*.md` file's "Source" line for exactly what was kept vs
  corrected.
- Local: `references/*.md` (one file per topic, listed above).
