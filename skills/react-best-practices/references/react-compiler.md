# React Compiler & memoization

Source: react.dev/learn/react-compiler and
react.dev/learn/react-compiler/introduction (verified 2026-09-29);
`eslint-plugin-react-hooks@7.1.1` README (verified via npm/GitHub raw,
2026-09-29). Updates `adrii-docs/skills/react-19/SKILL.md`, whose "no
manual memoization" rule was correct but predates the compiler reaching
**stable** status and predates the ESLint enforcement moving into
`eslint-plugin-react-hooks`.

## Status (verified, not carried over from training data)

- react.dev states: **"React Compiler is now stable and has been tested
  extensively in production."**
- Supports React **17, 18, and 19**.
- Next.js: usable via its swc-based integration from **Next.js v15.3.1+**.
- It is still an *opt-in* addition to React — not on by default in a
  plain React app — but the docs note some future features may require
  it.

## What it replaces

The compiler statically analyzes components and Hooks and inserts
memoization automatically, replacing hand-written:

- `useMemo`
- `useCallback`
- `React.memo`

**Rule: in a codebase that has the compiler enabled (check for
`babel-plugin-react-compiler` or the Next.js `experimental.reactCompiler`
/ swc integration in `next.config`), do not write manual `useMemo`/
`useCallback`/`React.memo` to fix a re-render.** The compiler:
- sees more of the component than a human tuning one dependency array,
- gets invalidated by any hand-written memoization it can't verify is
  correct — which is exactly what the `preserve-manual-memoization` rule
  flags.

If the codebase does **not** run the compiler, manual memoization is
still the correct tool for a *profiled* re-render problem — see
`performance.md`'s `rerender-*` rules (from
`adrii-docs/skills/vercel-react-best-practices`), which assume no
compiler.

## Requirements: Rules of React compliance

The compiler only produces correct memoization when the component
follows the **Rules of React**: no violating Rules of Hooks, no impure
render (mutating props/state, calling non-idempotent functions during
render), refs read only in effects/handlers. This is why its lint rules
(`immutability`, `purity`, `refs`, `static-components`,
`unsupported-syntax`) exist — they catch violations the compiler would
otherwise silently miscompile.

## Enforcement: it lives inside eslint-plugin-react-hooks now

As of `eslint-plugin-react-hooks@6+` (current: **7.1.1**), React
Compiler's lint rules were merged into the same package that ships
`rules-of-hooks`/`exhaustive-deps` — there is no separate
`eslint-plugin-react-compiler` to install anymore for new projects.

```js
// eslint.config.js (flat config, ESLint 9+)
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  reactHooks.configs.flat.recommended,       // rules-of-hooks, exhaustive-deps (stable)
  reactHooks.configs.flat['recommended-latest'], // + compiler rules (still experimental per the README)
];
```

Rules under `recommended-latest`: `config`, `error-boundaries`, `gating`,
`globals`, `immutability`, `preserve-manual-memoization`, `purity`,
`refs`, `set-state-in-effect`, `set-state-in-render`,
`static-components`, `unsupported-syntax`, `use-memo`,
`incompatible-library`. The README labels these "bleeding edge
experimental compiler rules" — enable `recommended-latest` deliberately,
know it can change between minor versions.

## Enable the compiler build step

Babel: `babel-plugin-react-compiler` in the Babel config. Next.js
(v15.3.1+): the swc-invoked compiler via `next.config`. Vite/Metro/Rsbuild
also supported. Adoption is incremental — can be scoped per-directory/
per-function; consult `/learn/react-compiler/installation` before
enabling repo-wide on an existing large codebase.
