---
paths:
  - "**/*.scss"
  - "**/*.css"
  - "**/*.sass"
  - "**/*.less"
---
# Frontend rules — styles

Binding when writing or reviewing stylesheets. Loaded only when a matching file is read. The standards behind
tokens and states are in skill `ui-ux-quality`; the manual review lists are `~/.claude/checklists/`
(design tokens, visual a11y, UI states), opened when the task is a styling review.

- Values come from the project's design tokens (CSS custom properties or the theme's Sass API), never a raw
  hex, pixel spacing or font size that duplicates a token. A missing token is added to the token source, not
  inlined.
- Component styles stay encapsulated. No `::ng-deep` (deprecated in Angular), no `!important`, no styling of
  another component's internal classes (`.mat-mdc-*`): use the component's theming API, tokens or a host
  class/input.
- Low specificity: one class per rule where possible, no ID selectors, no nesting deeper than the structure
  needs (Sass nesting of 3+ levels is a smell).
- Layout with flex/grid and logical properties (`margin-inline`, `padding-block`), so RTL works without
  overrides; no absolute positioning for flow layout.
- Every interactive element keeps a visible `:focus-visible` style with at least 3:1 contrast; never
  `outline: none` without a replacement. Text contrast meets WCAG 2.2 AA (4.5:1, 3:1 for large text).
- Motion respects `@media (prefers-reduced-motion: reduce)`; animate `transform`/`opacity`, not layout
  properties.
- Reserve space for media and async content (`aspect-ratio`, explicit sizes) to avoid layout shift (CLS:
  skill `web-performance`).
- Under a strict CSP without `'unsafe-inline'` for styles, dynamic values go through classes or CSS custom
  properties, not inline `style=""` rendered on the server (Angular detail: skill `angular-best-practices`,
  SSR and CSP).
- Sass: `@use`/`@forward`, never `@import` (deprecated by Dart Sass); no global selectors leaking from a
  component stylesheet.
