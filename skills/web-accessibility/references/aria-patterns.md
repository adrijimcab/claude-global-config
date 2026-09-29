# WAI-ARIA APG — Widget Patterns Reference

Source: [WAI-ARIA Authoring Practices Guide, Patterns](https://www.w3.org/WAI/ARIA/apg/patterns/)
and [Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).
Verified 2026-09-29. These are the normative reference for "what does a screen reader user expect
this widget to do" — component libraries that reinvent this from intuition reliably get it wrong.

## Dialog (Modal)

Source: [APG Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialogmodal/)

**Required ARIA**: `role="dialog"` on the container; `aria-modal="true"`; either
`aria-labelledby` (referencing a visible title) or `aria-label`. Optional: `aria-describedby`.

**Critical constraint**: `aria-modal="true"` must only be applied when the application *also*
prevents interaction with background content AND visual styling obscures it. Setting the attribute
without both of those is worse than omitting it — it tells assistive tech the background is
unreachable when it may not be.

**Keyboard**:
- On open, focus moves to an element inside the dialog (initial-focus placement depends on content:
  usually the first focusable element, or a more relevant one for complex/destructive dialogs).
- `Tab` / `Shift+Tab` cycle forward/backward through the dialog's tabbable elements only, wrapping
  at the ends (this is the "focus trap").
- `Escape` closes the dialog.
- On close, focus returns to the element that invoked the dialog, unless that element no longer
  exists or the workflow design calls for moving focus elsewhere.

## Combobox

Source: [APG Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)

**Required ARIA**: `role="combobox"` on the input wrapper, `aria-expanded` tracking popup
visibility, `aria-controls` pointing at the popup listbox id, `aria-autocomplete` describing the
completion behavior (`none`/`list`/`both`).

**Focus management — the key decision**: either (a) roving `tabindex` moves real DOM focus onto
listbox options as arrow keys are pressed, or (b) DOM focus stays on the input and
`aria-activedescendant` on the input points at the "active" option's id. Both are valid APG
patterns; (b) is what most combobox implementations use because it keeps the text cursor live in
the input while arrowing through suggestions.

**Keyboard**: `Down`/`Up` move the active option (opening the popup if closed); `Enter` commits the
active option; `Escape` closes the popup without committing; typing continues to filter/refine.

## Menu / Menu Button

Source: [APG Menu Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)

**Required ARIA**: trigger button has `aria-haspopup="menu"` and `aria-expanded`; menu container
has `role="menu"`; items have `role="menuitem"` (or `menuitemcheckbox`/`menuitemradio`).

**Keyboard**: `Enter`/`Space`/`Down` on the button opens the menu and moves focus to the first item;
`Down`/`Up` move focus among items (roving tabindex, wrapping); `Home`/`End` jump to first/last;
typing a character jumps to the next item starting with that character; `Escape` closes the menu
and returns focus to the button; `Tab` closes the menu (does not trap focus, unlike a dialog).

## Tabs

Source: [APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)

**Required ARIA**: `role="tablist"` on the container (with `aria-label`/`aria-labelledby`);
`role="tab"` on each tab, `aria-selected` reflecting active state, `aria-controls` pointing at its
panel; `role="tabpanel"` on each panel, `aria-labelledby` pointing back at its tab.

**Two valid activation models — pick one per widget, never mix**:
- **Automatic activation**: arrow keys both move focus AND select/show the panel immediately.
- **Manual activation**: arrow keys only move focus among tabs; `Enter`/`Space` selects. Preferred
  when activating a tab is expensive (e.g. triggers a network request).

**Keyboard**: `Left`/`Right` (or `Up`/`Down` for vertical tabs) move focus among tabs, wrapping;
`Home`/`End` jump to first/last tab; only the active tab is in the `Tab` sequence (roving tabindex).

## Listbox

Source: [APG Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)

`role="listbox"` on the container, `role="option"` on each item, `aria-selected` on selected
option(s), `aria-multiselectable="true"` if multi-select. Single-select: arrow keys move selection
directly. Multi-select: arrow keys move a focus cursor; `Space` toggles selection;
`Shift+Down`/`Shift+Up` extend a range; `Ctrl+A` selects all (implementation-dependent).

## Disclosure (Show/Hide)

Source: [APG Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)

The trigger is a real `<button>` with `aria-expanded` reflecting state and `aria-controls` pointing
at the revealed region's id. No special role is needed on the revealed content itself. `Enter`/
`Space` toggles (native button behavior — don't reimplement with a `div` + click handler).

## Tooltip

Source: [APG Tooltip Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)

`role="tooltip"` on the popup, referenced via `aria-describedby` from the triggering element (never
`aria-labelledby` — a tooltip supplements, it doesn't name). Appears on focus AND hover (not
hover-only — keyboard users must be able to trigger it); dismissible with `Escape` without moving
focus off the trigger; disappears on blur/mouseout with no unhoverable gap that traps the pointer.

## Accordion

Source: [APG Accordion Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)

Each header is a `<button>` (often wrapped in an `h3`) with `aria-expanded` and `aria-controls`
pointing at its panel; panels have no special role. `Down`/`Up` move focus between accordion
headers (roving tabindex); `Home`/`End` jump to first/last header.

## Roving tabindex vs. `aria-activedescendant` — when to use which

Source: [APG Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

- **Roving tabindex**: exactly one item in the composite widget has `tabindex="0"`, all others have
  `tabindex="-1"`; arrow keys move real DOM focus by updating which item has `tabindex="0"`.
  Robust — works with browser find-in-page, works if the AT doesn't fully support
  `aria-activedescendant`. Cost: must manage `tabindex` on every item as the set changes
  (virtualization, filtering).
- **`aria-activedescendant`**: the composite container itself is the one focusable element;
  `aria-activedescendant` on it names the "virtually focused" descendant's id, updated on
  navigation. Lighter to implement for virtualized/large lists since only one DOM node needs
  `tabindex`. Cost: some AT/browser combinations handle it less reliably than real focus moves;
  find-in-page won't find the "active" item.

Prefer roving tabindex for custom widgets unless the item set is large/virtualized (grids, big
listboxes), in which case `aria-activedescendant` is the pragmatic choice APG itself documents for
that case (e.g. the Grid pattern).
