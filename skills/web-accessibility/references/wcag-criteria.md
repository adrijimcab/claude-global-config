# WCAG 2.2 Success Criteria — Component Library Reference

Source: [W3C Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation](https://www.w3.org/TR/WCAG22/) /
[Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/). Verified 2026-09-29 against the live
Quick Reference tool. Quote the exact criterion text before citing a number from memory — WCAG
numbering and level assignments are normative and get misquoted often.

## Perceivable

- **1.3.1 Info and Relationships (A)** — Structure, relationships, and order conveyed through
  presentation can be programmatically determined or are available in text.
- **1.4.3 Contrast (Minimum) (AA)** — Text and images of text have a contrast ratio of at least
  4.5:1, except large text (≥3:1), incidental text, and logotypes.
- **1.4.4 Resize Text (AA)** — Text can be resized up to 200% without loss of content or function.
- **1.4.11 Non-text Contrast (AA)** — UI components and graphical objects have ≥3:1 contrast against
  adjacent colors.

## Operable

- **2.1.1 Keyboard (A)** — "All functionality of the content is operable through a keyboard
  interface without requiring specific timings for individual keystrokes."
- **2.1.2 No Keyboard Trap (A)** — "If keyboard focus can be moved to a component using a keyboard
  interface, then focus can be moved away using only a keyboard interface."
- **2.4.6 Headings and Labels (AA)** — Headings and labels describe topic or purpose.
- **2.4.7 Focus Visible (AA)** — "Any keyboard operable user interface has a mode of operation
  where the keyboard focus indicator is visible."
- **2.4.11 Focus Not Obscured (Minimum) (AA, new in 2.2)** — "When user interface components
  receive keyboard focus, the component is not entirely hidden behind author-created content."
- **2.4.13 Focus Appearance (AAA, new in 2.2)** — "When the keyboard focus indicator is visible, an
  area of the focus indicator meets a contrast ratio of at least 3:1 against adjacent colors."
- **2.5.5 Target Size (Enhanced) (AAA)** — Pointer targets are at least 44×44 CSS px, with listed
  exceptions (inline, essential, user-agent-controlled, or equivalent).
- **2.5.8 Target Size (Minimum) (AA, new in 2.2)** — "The size of the target for pointer input is
  at least 24 by 24 CSS pixels except where a smaller size is essential."
- **3.2.6 Consistent Help (A, new in 2.2)** — "If a web page contains any of three specific help
  mechanisms, those mechanisms appear in the same order relative to other page content" across a
  set of pages.
- **3.3.7 Redundant Entry (A, new in 2.2)** — "Information previously entered ... is not
  re-requested unless reconfirmation is essential or data has become invalid."
- **3.3.8 Accessible Authentication (Minimum) (AA, new in 2.2)** — "Cognitive function tests are
  not required to access content unless alternatives exist or the test is essential." (3.3.9 is the
  AAA variant with no exceptions.)

## Understandable / Robust

- **4.1.2 Name, Role, Value (A)** — "For all user interface components, the name and role can be
  programmatically determined; states, properties, and values ... can be programmatically set; and
  notification of changes ... is available to user agents, including assistive technologies."
- **4.1.3 Status Messages (AA)** — "In content implemented using markup languages, status messages
  can be programmatically determined through role or properties such that they can be presented to
  the user by assistive technologies without receiving focus." Implementation: `role="status"` /
  `aria-live="polite"` for advisory messages, `role="alert"` / `aria-live="assertive"` for errors.

**Removed in 2.2**: 4.1.1 Parsing (dropped as obsolete — modern browsers/AT handle malformed markup
consistently, so this no longer measures anything real).

## What automation catches vs. what needs manual review

Automated tools (axe, Lighthouse) reliably catch: missing alt text, missing form labels, contrast
ratio on solid backgrounds, missing document `lang`, duplicate IDs, invalid ARIA attribute values.
They reliably **miss**: whether the reading order matches visual order, whether a live region
actually fires when it should, whether keyboard focus lands somewhere sensible after a dynamic
update, whether the "accessible name" text is actually meaningful (vs. present-but-useless), and
color contrast over gradients/images (this is a genuine tool limitation, not a false negative —
flag it for manual verification via screenshot, don't suppress the finding).
