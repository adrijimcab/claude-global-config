---
name: ui-ux-quality
description: >
  This skill should be used when the user asks to review or design a design system, component
  states, or interaction quality — "design tokens", "interaction states", "hover/focus/pressed
  state", "state layer", "component variants", "design system audit", "Material 3", "M3 tokens",
  "design consistency". Provides the Material 3 reference model for design tokens and interaction
  states so a review has a named standard to check against. Does NOT replace this project's own
  three manual checklists (design tokens, a11y-visual, UI states) — it is the standards reference
  they can cite; use those checklists for the actual audit pass and this skill when a question is
  "what does the Material 3 spec say" rather than "audit this component".
license: MIT
metadata:
  owner: b100-am-ui cross-cutting skills
  scope: Material 3 design tokens + interaction states model
  companions: ~/.claude/checklists/DESIGN-TOKENS-CHECKLIST.md, ~/.claude/checklists/UI-STATES-CHECKLIST.md, ~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md, frontend-design (aesthetic direction, not systemic consistency)
---

# UI/UX & Design-System Quality (Material 3 reference)

This skill is a **standards reference**, not an audit procedure — the owner already has three
manual checklists that own the actual audit workflow:
`~/.claude/checklists/DESIGN-TOKENS-CHECKLIST.md` (token hygiene — hardcoded values, scale
consistency, dark-mode parity), `~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md` (WCAG-mapped visual
checks), `~/.claude/checklists/UI-STATES-CHECKLIST.md` (loading/empty/error/success/disabled/hover/
focus/active coverage per route). Use those for the audit itself; use this skill when the question
behind the audit is "what's the actual Material 3 spec for X" so the checklist's findings are graded
against a named, cited standard instead of house intuition. For net-new visual/aesthetic direction
(palette, typography, layout personality) rather than systemic token/state consistency, that's
`frontend-design`'s job, not this skill's — the two are complementary: `frontend-design` picks the
distinctive point of view, this skill and the checklists keep it systematically consistent once
chosen.

## Design token taxonomy

Source: [Material 3 — Design Tokens Overview](https://m3.material.io/foundations/design-tokens/overview).
M3 organizes tokens in three tiers:

1. **Reference tokens** — raw values (a color's hex, a specific px/dp size) with no semantic
   meaning attached yet. Rarely referenced directly by components.
2. **System tokens** — semantic roles that reference the tier-1 values (`primary`, `on-primary`,
   `surface`, `outline`, `corner-medium`) — this is the tier components should consume, and the
   tier that changes per-theme (light/dark/custom brand) without touching component code.
3. **Component tokens** — a specific component's own named slots that reference system tokens
   (`button.container-color` → `primary`) — lets one component deviate from the system default
   deliberately, in exactly one place, without a component-specific override scattered through CSS.

**Direct application to `~/.claude/checklists/DESIGN-TOKENS-CHECKLIST.md`**: that checklist's rule
"overrides of Material shape must go through `--mat-sys-corner-*`, not a hardcoded `border-radius`"
is exactly the reference→system→component discipline above — a hardcoded value skips straight to
tier 1 in the component, bypassing the system tier that makes theming and dark-mode parity possible
at all. When a review finds a hardcoded value, the fix is always "which system token *should* this
reference", never "add this exact value as a new one-off token."

## Interaction states model

Source: [Material 3 — States Overview](https://m3.material.io/foundations/interaction/states/overview).
M3 defines a fixed set of interaction states every interactive component should express:
**enabled, hovered, focused, pressed, dragged, disabled**. Each non-enabled/disabled state is
typically expressed as a **state layer** — a semi-transparent overlay of the content color on top
of the container, at a defined opacity per state — rather than as an entirely different color, which
is why state layers compose correctly regardless of the underlying container color (light or dark
theme, any brand color) without needing a separate hand-picked hover color per surface.

**Direct application to `~/.claude/checklists/UI-STATES-CHECKLIST.md`**: that checklist's states
(Loading/Empty/Error/Success/Disabled/Hover/Focus/Active) map onto M3's model with Loading/Empty/
Error/Success being *data* states (not part of M3's interaction-state model — they're this
project's own necessary addition on top of it) while Disabled/Hover/Focus/Active are exactly M3's
interaction states (Active ≈ M3's "pressed"). When auditing a component's hover/focus/pressed
treatment, check whether it's implemented as a state-layer opacity change over the existing
container color (correct, M3-conformant) or as a hardcoded alternate color per state (a token-scale
violation — flag it against `DESIGN-TOKENS-CHECKLIST.md` too, since the two checklists' findings
usually co-occur here).

## Touch target size — M3's own number vs. WCAG's

M3's own guidance (cross-referenced from Android accessibility guidance it shares platform
conventions with): **48×48dp minimum touch target**, even when the visible icon is smaller (e.g. a
24×24dp icon sits inside 12dp of padding on each side to reach the 48dp target) — with 8dp minimum
spacing between adjacent targets. This is **stricter** than WCAG 2.2's 2.5.8 Target Size (Minimum)
AA requirement of 24×24 CSS px, and close to WCAG 2.5.5 Target Size (Enhanced) AAA's 44×44 CSS px.
Practical takeaway for this library: building to the M3 48dp figure satisfies both the AA (2.5.8)
and effectively the AAA (2.5.5) WCAG criteria simultaneously — see the `web-accessibility` skill for
the exact WCAG criterion text and level.

## What this skill does NOT replace

- **The audit itself** — the three checklists own that; this is their cited reference standard.
- **Aesthetic/visual-identity decisions** — `frontend-design` owns picking a distinctive direction;
  this skill only keeps a chosen direction systematically consistent once tokens exist.
- **Accessibility criteria beyond touch target size** — `web-accessibility` owns the full WCAG/ARIA
  surface; this skill only notes where M3's own numbers intersect with it.
