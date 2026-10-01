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


## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-30 — brief-marker-written-as-prose-not-literal-form: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/brief-provenance/guard.mjs (selftest run, exit 0); full incident history in .claude/failure-capture/state/incidents.jsonl <!--fc:brief-marker-written-as-prose-not-literal-form#3-->

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`brief-marker-written-as-prose-not-literal-form`** — CLOSED BY MECHANISM 2026-09-09; this entry
  states the rule the mechanism enforces. A delegation brief must carry both provenance markers, and
  the check is: **the word `MEASURED` / `HYPOTHESIS` STARTS its own line, and that line carries a
  colon somewhere.** What sits between the word and the colon is yours — a qualifier, a parenthetical,
  a date, a sha. Both of these pass: `MEASURED: 70 of 70` and
  `- MEASURED (by me, on develop just now): 70 of 70`. The property that matters is that the brief
  carries a provenance DECLARATION — a line whose subject is the marker — never a glued-colon
  anywhere-in-the-brief proxy, which passed three delegations that carried no real declaration. The
  check is a literal line scan, never a regex, and it names which of three refusal states applies
  (`absent`, `buried`, `no-colon`). Guard `~/.claude/brief-provenance/guard.mjs`; 22/22 across the
  decision's state space in `~/.claude/brief-provenance/selftest.mjs`.
  - **THE RESUME WRITTEN AS PROSE (2026-09-30).** The guard refused 39 delegations in one session
    (measured from the transcript): 13 SendMessages with neither marker, ~5 with MEASURED buried in
    a sentence ("Ownership update. MEASURED: …"). No damage reached a worker, but every refusal is a
    wasted round, and it recurs because short resumes are drafted as conversation with the markers
    bolted on. RULE: every Agent prompt and every worker SendMessage is drafted FROM the skeleton —
    line 1 `MEASURED: …`, line 2 `HYPOTHESIS: …`, then the instruction — even a two-line resume; for
    a non-trivial brief run `node ~/.claude/brief-feasibility/preflight.mjs <draft>`, which runs every
    delegation guard in one pass, before sending.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/brief-marker-written-as-prose-not-literal-form.md`.
````
