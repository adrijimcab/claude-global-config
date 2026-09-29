# Accessibility

Source: `eslint-plugin-jsx-a11y@6.10.2` README (verified via raw GitHub
fetch, 2026-09-29) for the enforced rule list; react.dev has no dedicated
a11y guide as a primary source, so the checkable gate here is the
enforcement tool itself.

## Enable the gate

```js
// eslint.config.js (flat config)
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  jsxA11y.flatConfigs.recommended,
];
```

## What `recommended` catches (31 rules)

Structural/semantic: `alt-text`, `anchor-has-content`,
`anchor-is-valid`, `heading-has-content`, `html-has-lang`,
`iframe-has-title`, `img-redundant-alt`, `no-redundant-roles`, `scope`.

Interaction/keyboard parity — the rules that catch "works with a mouse,
broken with a keyboard":
`click-events-have-key-events`, `mouse-events-have-key-events`,
`interactive-supports-focus`, `no-noninteractive-tabindex`,
`no-noninteractive-element-interactions`,
`no-static-element-interactions`, `tabindex-no-positive`, `no-autofocus`,
`no-access-key`.

ARIA correctness — catches ARIA attributes that lie about the element's
role or are structurally invalid:
`aria-activedescendant-has-tabindex`, `aria-props`, `aria-proptypes`,
`aria-role`, `aria-unsupported-elements`, `role-has-required-aria-props`,
`role-supports-aria-props`,
`no-interactive-element-to-noninteractive-role`,
`no-noninteractive-element-to-interactive-role`.

Forms/media: `label-has-associated-control`, `autocomplete-valid`,
`media-has-caption`, `no-distracting-elements`.

## Rules of thumb behind the lint

- **Every interactive element must be keyboard-operable** — if it has an
  `onClick`, it needs either to be a native `<button>`/`<a>` or to also
  handle `onKeyDown` (Enter/Space) and be focusable (`tabIndex={0}`, not
  a positive value).
- **Every form control has an associated `<label>`** — visually hidden is
  fine, missing is not.
- **Don't fake a role you don't implement.** Adding `role="button"`
  without the matching keyboard behavior and focus management is worse
  than a plain `<div onClick>` — it tells assistive tech the element is
  operable when it isn't.
- **Prefer semantic HTML over ARIA.** `role`/`aria-*` are for the cases
  semantic HTML genuinely can't express — the "first rule of ARIA" is
  don't use it if a native element already does the job.

## Verifying beyond static lint

`eslint-plugin-jsx-a11y` is static analysis — it cannot see computed
color contrast, focus order, or screen-reader announcement text. Verify
those with the Chrome DevTools MCP `a11y-debugging` skill (contrast,
focus states, tap targets, keyboard nav) or a Lighthouse accessibility
audit, in the same review pass as the lint gate above.
