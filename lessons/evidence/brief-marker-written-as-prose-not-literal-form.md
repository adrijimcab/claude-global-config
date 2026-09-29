# `brief-marker-written-as-prose-not-literal-form` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

- **`brief-marker-written-as-prose-not-literal-form`** — CLOSED BY MECHANISM 2026-09-09; this entry now
  states the rule the mechanism enforces, not a habit to remember. A delegation brief must carry both
  provenance markers, and the check is: **the word `MEASURED` / `HYPOTHESIS` STARTS its own line, and
  that line carries a colon somewhere.** What sits between the word and the colon is yours — a
  qualifier, a parenthetical, a date, a sha. Bullets and indentation are fine. Both of these pass:
  `MEASURED: 70 of 70` and `- MEASURED (by me, on develop just now): 70 of 70`.
  **THE ROOT CAUSE, and why the earlier text here was itself part of the defect.** The first guard
  tested `prompt.includes('MEASURED:')` — colon glued to the word, anywhere in the brief — and this
  entry wrote that PROXY up as if it were the rule. It is not. The property that matters is that the
  brief carries a provenance DECLARATION, i.e. a line whose subject is the marker; glued-colon was an
  implementation convenience promoted to a requirement. It refused three delegations in one session,
  every one written by an author doing the right thing, and this promoted paragraph prevented not one
  of them — which is the finding, not the footnote: **a contract is a warning, a mechanism is
  prevention** (see `promotion-to-contract-read-as-prevention`).
  The re-aimed check is STRICTER, not laxer: `…as the MEASURED: value shows…` buried mid-paragraph
  passed before and is refused now, and `MEASUREDLY:` cannot satisfy `MEASURED`. It stays a literal
  line scan — never a regex, which could silently skip a brief with no markers at all — and it names
  which of the three refusal states you are in (`absent`, `buried`, `no-colon`), because a control
  that decides correctly but explains poorly gets routed around just the same.
  Guard `~/.claude/brief-provenance/guard.mjs`; 22/22 across the decision's state space, including the
  two real refused forms, in `~/.claude/brief-provenance/selftest.mjs`.

