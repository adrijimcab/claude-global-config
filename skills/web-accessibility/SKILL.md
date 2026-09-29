---
name: web-accessibility
description: >
  This skill should be used when the user asks to audit, fix, or design for accessibility
  ("a11y", "WCAG", "ARIA", "screen reader", "keyboard navigation", "focus order", "focus trap",
  "color contrast", "tap target size", "accessible name", "aria-label", "aria-live", "aria-modal",
  "role=dialog", "combobox pattern", "accessible authentication") on an Angular or React
  component, page, or design system. Covers WCAG 2.2 success criteria and the WAI-ARIA Authoring
  Practices Guide (APG) design patterns for interactive widgets (dialog, combobox, listbox, menu,
  tabs, disclosure, tooltip, accordion, grid). Complements `chrome-devtools-mcp:a11y-debugging`
  (browser-driven auditing with Chrome DevTools MCP) by providing the underlying rule set and
  correct-implementation patterns that debugging session should verify against — load both when
  actually testing a live page.
paths:
  - "**/*.component.html"
  - "**/*.component.ts"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.stories.ts"
  - "**/*.stories.tsx"
license: MIT
metadata:
  owner: b100-am-ui cross-cutting skills
  scope: WCAG 2.2 AA + WAI-ARIA APG, Angular/React component libraries
  companions: chrome-devtools-mcp:a11y-debugging, debug-optimize-lcp, ~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md
---

# Web Accessibility (WCAG 2.2 + ARIA APG)

This skill supplies the **rule set and correct-pattern reference** for building and auditing
accessible UI. `chrome-devtools-mcp:a11y-debugging` supplies the **tooling** (snapshot the a11y
tree, run Lighthouse, measure contrast/tap-target via `evaluate_script`) to verify against these
rules on a live page — use both together when testing, this skill alone when designing/reviewing
code, and `~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md` for the manual sign-off pass this skill
does not replace (it already maps WCAG criteria to concrete test steps in Spanish for this repo).

Do not re-derive WCAG numbers from memory. Every rule below is sourced from the W3C normative
text; when a criterion is not listed here, fetch it live from
`https://www.w3.org/WAI/WCAG22/quickref/` rather than guessing.

## Decision order

1. **Is this a custom interactive widget** (dialog, menu, combobox, tabs, accordion, tooltip,
   disclosure, listbox, grid)? → Go straight to the matching pattern in
   `references/aria-patterns.md`. Reinventing keyboard behavior for these is the #1 source of a11y
   bugs in component libraries — the APG pattern is normative for what screen readers expect.
2. **Is this a static page/content change** (headings, images, forms, links, tables)? → Check the
   relevant WCAG 2.2 success criteria in `references/wcag-criteria.md`.
3. **Is this a design-system-level decision** (focus ring, color token, spacing, motion)? → Cross
   the WCAG numeric thresholds below against `~/.claude/checklists/DESIGN-TOKENS-CHECKLIST.md` and
   `~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md` — those checklists already encode this project's
   token-to-criterion mapping; do not duplicate them here.
4. **Auditing a live rendered page**? → Use `chrome-devtools-mcp:a11y-debugging`'s `take_snapshot` /
   `lighthouse_audit` / `evaluate_script` workflow, checking results against this skill's rules.

## WCAG 2.2 — the criteria that actually break component libraries

Full text: [W3C WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/). These are the
ones most relevant to a component library (not a content site) — see `references/wcag-criteria.md`
for the complete list with exact normative text:

| SC | Level | One-line rule |
|----|-------|----------------|
| 2.1.1 Keyboard | A | Every function operable via keyboard alone, no keystroke-timing requirement |
| 2.1.2 No Keyboard Trap | A | Focus can always be moved away using only the keyboard |
| 2.4.7 Focus Visible | AA | A visible focus indicator exists for every keyboard-operable UI |
| 2.4.11 Focus Not Obscured (Minimum) | AA | The focused component is never fully hidden behind other content |
| 2.4.13 Focus Appearance | AAA | Focus indicator has ≥3:1 contrast against adjacent colors, min area |
| 2.5.8 Target Size (Minimum) | AA | Pointer targets ≥24×24 CSS px, unless inline, essential, or spaced |
| 3.2.6 Consistent Help | A | Help mechanisms appear in the same relative order across pages |
| 3.3.7 Redundant Entry | A | Don't re-ask for info the user already entered in the same process |
| 3.3.8 Accessible Authentication (Minimum) | AA | No cognitive-function test required to log in, unless an alternative exists |
| 4.1.2 Name, Role, Value | A | Every UI component has a programmatically determinable name/role/state |
| 4.1.3 Status Messages | AA | Status messages are programmatically determinable without moving focus |

**New in 2.2 vs. 2.1** (easy to miss if the project's baseline predates 2.2): 2.4.11 Focus Not
Obscured, 2.4.13 Focus Appearance, 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum), 3.2.6
Consistent Help, 3.3.7 Redundant Entry, 3.3.8/3.3.9 Accessible Authentication. WCAG 2.2 also
**removed** 4.1.1 Parsing (obsolete now that browsers all handle malformed markup consistently).

**b100-am-ui's own touch-target rule**: `~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md` §3 already
pins this to WCAG 2.5.8 (AA, 24×24) and 2.5.5 (AAA, 44×44) — this library targets the AAA figure
for primary actions. Don't relitigate that decision here; follow the checklist.

## WAI-ARIA APG — patterns for custom widgets

Full patterns: [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/). Keyboard-interface
conventions: [APG Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).
See `references/aria-patterns.md` for the full keyboard tables. Summary of the ones a component
library implements most often:

- **Dialog (Modal)**: `role="dialog"` + `aria-modal="true"` + (`aria-labelledby` or `aria-label`).
  Focus moves into the dialog on open; `Tab`/`Shift+Tab` cycle and wrap within it (focus trap);
  `Escape` closes it; focus returns to the invoking element on close. `aria-modal="true"` is only
  correct when the app *also* prevents interaction with, and visually obscures, background content
  — setting the attribute without the behavior is worse than omitting it.
- **Combobox**: uses roving `aria-activedescendant` or roving `tabindex` on the listbox
  (`references/aria-patterns.md` explains when to use each). `aria-expanded` on the input tracks
  popup state; `aria-controls` points at the listbox; arrow keys move the active option without
  moving DOM focus off the input.
- **Menu / Menu Button**: `role="menu"`/`role="menuitem"`, arrow keys navigate, `Home`/`End` jump to
  first/last, typeahead selects by first letter, `Escape` closes and returns focus to the button.
- **Tabs**: `role="tablist"`/`role="tab"`/`role="tabpanel"`, `aria-selected` on the active tab,
  arrow keys move selection (automatic activation) or just focus (manual activation) — pick one
  model per widget, never mix.

**Roving tabindex vs. `aria-activedescendant`**: roving tabindex physically moves DOM focus (more
robust, works with browser find-in-page and extensions, but requires managing `tabindex="-1"`/`"0"`
on every item); `aria-activedescendant` keeps DOM focus on the container and only updates an
attribute (lighter to implement, but breaks in some screen-reader/browser combos and with
find-in-page). Prefer roving tabindex for custom widgets unless the item set is very large/virtualized.

## Common false positives (don't invent problems)

- `@HostListener('document:...')` inside an `effect()` does **not** cause global change-detection
  leaks under `provideExperimentalZonelessChangeDetection()` — no zone.js exists to monkey-patch.
  (See this project's `AGENT-LEDGER.md` §8 anti-false-positive list.)
- `*.stories.ts`/`*.spec.ts` are not public API surface — don't demand bilingual docs or flag them
  as "undocumented" from an a11y-completeness pass.
- A component that composes an official Material/CDK a11y primitive (e.g. `cdk-a11y` `FocusTrap`,
  `LiveAnnouncer`) inherits that primitive's WCAG compliance — don't re-audit what the primitive
  already guarantees; audit the composition seams (labels, focus restoration on custom close paths).

## What this skill does NOT replace

- **Tool execution** (axe/Lighthouse/Playwright runs) — see `gates-kit/README.md` for
  `check:a11y` / `check:demo-a11y` and how to bootstrap the equivalent in a fresh consumer project.
- **Manual visual sign-off** — `~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md` and
  `~/.claude/checklists/UI-STATES-CHECKLIST.md` own that; this skill is the rule reference they cite.
- **Live-page debugging** — `chrome-devtools-mcp:a11y-debugging`'s snippets
  (orphaned-input detection, tap-target measurement, contrast checks) are the executable half of
  sections 6-7 above; invoke that skill when a browser session is open.

## Additional resources

- `references/wcag-criteria.md` — full WCAG 2.2 A/AA criteria table relevant to component libraries,
  each with the exact normative text and source URL.
- `references/aria-patterns.md` — keyboard-interaction and ARIA role/state tables for dialog,
  combobox, menu, tabs, listbox, disclosure, tooltip, accordion, grid, each cited to its APG page.
