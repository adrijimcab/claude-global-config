# React Gates

React-specific additions on top of `tier1-tier3-menu.md`. Every entry is a real AST-based ESLint rule,
never a regex over JSX source.

@es Añadidos específicos de React sobre `tier1-tier3-menu.md`. Cada entrada es una regla de ESLint
basada en AST, nunca un regex sobre fuente JSX.

## 1. `eslint-plugin-react` + `eslint-plugin-react-hooks`

```js
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [{
  plugins: { react, 'react-hooks': reactHooks },
  rules: {
    ...react.configs.recommended.rules,
    ...reactHooks.configs.recommended.rules,
    'react-hooks/exhaustive-deps': 'error', // the single highest-value rule in this file
    'react/jsx-key': 'error',
    'react/no-array-index-key': 'warn',
    'react/jsx-no-target-blank': 'error', // rel="noopener noreferrer" enforcement
  },
}];
```

**Catches**: `react-hooks/rules-of-hooks` (conditional/looped hook calls — a real runtime-crash class),
`react-hooks/exhaustive-deps` (stale closures over props/state inside `useEffect`/`useMemo`/
`useCallback` — the single most common React bug class this kit's menu addresses), `jsx-key` (list
re-render bugs), `jsx-no-target-blank` (a real security gap: a `target="_blank"` link without
`rel="noopener"` lets the opened page's `window.opener` navigate the original tab — reverse
tabnabbing).

**Rollout note**: `exhaustive-deps` on an existing hook-heavy codebase WILL surface real bugs it
autofixes into `useCallback`/`useMemo` wraps that change behavior, not just style — read each fix, per
the senior-stance rule (never trust a lint autofix blindly on logic-bearing code), before landing it as
part of "zero offenders."

@es **Detecta**: `rules-of-hooks` (llamadas de hook condicionales/en bucle — una clase real de crash en
runtime), `exhaustive-deps` (closures obsoletas sobre props/state dentro de `useEffect`/`useMemo`/
`useCallback` — la clase de bug más común de React que este kit aborda), `jsx-key` (bugs de re-render
en listas), `jsx-no-target-blank` (hueco de seguridad real: reverse tabnabbing sin `rel="noopener"`).
Desplegar `exhaustive-deps` en un código con muchos hooks VA a sacar bugs reales cuyo autofix cambia
comportamiento, no solo estilo — leer cada arreglo antes de darlo por "cero infractores".

## 2. `eslint-plugin-jsx-a11y`

```js
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [{
  plugins: { 'jsx-a11y': jsxA11y },
  rules: jsxA11y.configs.strict.rules,
}];
```

See `tier1-tier3-menu.md` #3 for what this class of rule catches (it is the React-side twin of
Angular's template a11y bundle in `angular.md` #1). `configs.strict` over `configs.recommended` is the
deliberate choice here: a fresh project should start strict and relax a specific rule with a documented
reason if it proves genuinely inapplicable, never start lenient and tighten later — tightening later is
how a real gap survives unnoticed.

@es Ver `tier1-tier3-menu.md` #3 (es el gemelo del lado React del paquete de a11y de plantillas de
Angular). Se elige `configs.strict` sobre `configs.recommended` deliberadamente: un proyecto nuevo
empieza estricto y relaja una regla puntual con motivo documentado si resulta genuinamente
inaplicable, nunca empieza laxo para endurecer después.

## 3. Next.js (App Router) note

A Next.js project layers its own gates on top of the above (`eslint-config-next`, which already bundles
`react`/`react-hooks`/`jsx-a11y` plus Next-specific rules like `next/no-img-element`). Do not
re-declare the plugins this kit already lists if `eslint-config-next` is in use — check
`eslint --print-config <file>` (per the owner's standing rule: resolve which rules actually apply with
the tool that owns that question, never by reading rule text alone) before adding a duplicate or
conflicting entry. Full App Router guidance: `~/.claude/skills/nextjs-app-router`.

@es Un proyecto Next.js apila sus propios gates sobre lo de arriba (`eslint-config-next` ya incluye
`react`/`react-hooks`/`jsx-a11y` más reglas propias de Next). No re-declarar los plugins que este kit
ya lista si `eslint-config-next` está en uso — comprobar con `eslint --print-config <file>` antes de
añadir una entrada duplicada o en conflicto. Guía completa de App Router:
`~/.claude/skills/nextjs-app-router`.

## 4. Bundle budgets

React/Vite projects use `size-limit` or `webpack-bundle-analyzer` + a custom size-diff check — see
`tier1-tier3-menu.md` #12 for what this catches and its cost; Angular's equivalent is native
`angular.json` `budgets` (`angular.md` #5).

@es Ver `tier1-tier3-menu.md` #12.
