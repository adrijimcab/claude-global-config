# `unmeasured-rationale-stated-as-fact-in-brief` — evidencia completa (AGENT-LEDGER §3)

Texto literal movido desde `<b100-am-ui>/.claude/AGENT-LEDGER.md` (y su espejo en español,
`.agents/AGENTS.md`) al aplicar el prompt-audit aprobado por el dueño. La forma vinculante (el
enunciado base + los cinco corolarios reducidos a su frase RULE) sigue viviendo en ambos contratos
de agente. Esta clave está promovida al CONTRATO DEL PROYECTO (AGENT-LEDGER.md + AGENTS.md), no al
sistema global `~/.claude/rules/promoted-rules.md`, así que no tenía un archivo de evidencia propio
— se crea ahora, en el directorio global de evidencia por ser el único autorizado para esta tarea,
para no perder el detalle medido al condensar la sección.

- **MEASURE THE MECHANISM, NOT THE SYMPTOM, BEFORE A RULE IS WRITTEN DOWN
  (`unmeasured-rationale-stated-as-fact-in-brief`).** Promoted into this contract because it recurred:
  binding, not advice. A rule inferred from what an incident LOOKED like outlaws the wrong thing and
  spares the real cause. Measured here: the standing rule "never build escapes, regexes or non-ASCII
  in a shell one-liner" banned non-ASCII on the strength of one incident — French text losing its
  apostrophes — whose mechanism was never checked. Non-ASCII in fact survives INTACT through both
  Bash and PowerShell, and the incident's own evidence said so all along: `d'échouer` became
  `d échouer`, KEEPING the accented `é` and losing the ASCII apostrophe. The real cause was a quote
  character inside a payload delimited by that same quote. Encoding the symptom would have refused
  23.8% of all node-eval one-liners, 325 of them for a hazard that does not exist — and a guard that
  is demonstrably wrong is a guard the fleet learns to route around. So: before a rule enters a
  contract or a gate, reproduce the mechanism, and write the measurement NEXT to the rule so the next
  reader can check it instead of inheriting it.
  Two corollaries, both earned the expensive way. **A THRESHOLD is itself a claim about a
  distribution** and owes exactly the provenance any other number owes: measure the population before
  choosing a cut-off, or design the control so it needs no cut-off at all. And **replay the ORIGINAL
  incident through the FINISHED mechanism** — a guard verified only on cases you invented is verified
  against your imagination. Measured: a delegation guard was built to stop this very rule from
  recurring and given a 1500-character trigger, justified in its own comment with "the incidents were
  all long briefs" — a fact nobody had checked. Replaying the actual brief returned ALLOWED at 1086
  characters. The mechanism built to prevent the failure would not have prevented the failure that
  motivated it, because of a number invented while mechanising the rule against inventing numbers.
  Length was never the variable; the threshold was removed and the control now asks the author.
  A third corollary, and the one that slips past the other two because it does not look like a number
  at all: **"X happened, WHICH MEANS the mechanism is Y" is a HYPOTHESIS wearing a conclusion's
  clothes.** Measured: a brief asserted that four branches had survived two audits "which means those
  audits enumerated worktrees, not refs". The worker opened the file and refuted it in one read —
  `close.mjs:156` enumerates refs via `for-each-ref refs/heads/`; the real cause was that its sweep
  judged by ancestry. The inference was reasonable, it was wrong, and the file that settled it was one
  read away. So: an explanation inferred from an OUTCOME goes under `HYPOTHESIS:` **naming the file
  that would settle it**, or it gets read before it is written. And the same brief's TITLE claimed the
  branches "hold content develop lacks" when the measurement only supported "N files whose blob
  differs" — **never let a title assert more than the measurement supports**, because the title is
  what the next reader inherits without checking.
  A FOURTH corollary, and the nastiest, because it does not read like a guess at all — **LAUNDERING:
  attaching your own inference to somebody else's MEASURED finding inside one attributed sentence.**
  Measured: a resume message said "Another worker independently confirmed the sibling-gate hazard …
  Both share the same specifier reconstruction." The first half was that worker's real measurement.
  The second sentence was the author's own inference, invented on top and handed over wearing the
  other worker's credibility. The repairing worker READ both gates in full and refuted it:
  `check:consumer-resolution` installs only the tarball plus tslib at the dist's declared range and
  no peers at all, and `check:consumer-app` returns `devDependencies[name]`, the DECLARED specifier —
  neither reconstructs anything, so there was nothing there to close. This is strictly WORSE than
  stating the guess plainly, because a guess marked as a guess gets tested, while a guess fused to a
  measurement cannot be told apart from it: the reader has no seam to grip. RULE: a measured finding
  and your inference from it are TWO claims and must be written as two — the measurement with its
  owner named, the inference under `HYPOTHESIS:` as something to test. Never extend somebody else's
  evidence with your own reasoning inside the same attributed sentence.
  A FIFTH corollary, and the one with no safety net — **A RECOMMENDATION TO WHOEVER DECIDES OWES A
  HIGHER BAR THAN A BRIEF, NOT A LOWER ONE.** Everything above is written about briefs, and a brief has
  a reader downstream who opens the code and refutes it; that has happened repeatedly and it is the
  system working. An architectural recommendation handed to the DECIDER has nobody in between. Measured:
  the owner was told, as the senior-architect answer, that a private library should declare its two lint
  plugins as normal `dependencies` so they "come implicitly" — stated without reading the package's
  `exports` map. One command refuted it: **74 export sub-paths including `./stylelint`**, so the library
  ALREADY ships a shareable lint config and ALREADY declares its six stylelint peers optional, which is
  the canonical pattern; `dependencies` would force every consumer's PRODUCTION `node_modules` to carry
  lint tooling. The only thing that caught it was a voluntary re-measurement before executing — luck
  dressed as diligence. RULE: an architectural recommendation is a claim about the CURRENT design and
  owes the same receipt as any other. Read the manifest, the exports map, and the config it would change
  BEFORE naming what a senior architect would do. When you are the last reader before a decision, the
  evidentiary bar goes UP.
  A SIXTH corollary, and it hides where nothing prompts a measurement — **A CONSTRAINT'S RATIONALE IS
  A CLAIM ABOUT THE PRESENT TREE, and "doing X would break Y" presumes Y is currently intact.**
  Everything above concerns a rule DERIVED from a past incident. This one is a rule justified by a
  statement about the tree RIGHT NOW, written into the justification rather than into the evidence
  section — so no marker, no `MEASURED:` line, and no habit of provenance ever touches it. Measured
  2026-09-20: a brief imposed a hard constraint — "the visual capture entry and its baseline must land
  in the SAME commit" — whose stated reason was that landing the entry alone "turns the gate red for a
  MISSING FILE rather than for a regression, and a gate that reddens on a correct tree is how a gate
  gets switched off". The reasoning is sound and the premise was never checked. The worker measured it
  and refuted it: the `visual:` job was **already red on 96 missing `-linux` baselines** (392 expected
  against 296 on disk), so there was no correct-tree-green to protect. The constraint, obeyed
  literally, would have blocked the single run that closes all 104 at once — a rule derived from an
  unmeasured baseline state forbidding exactly the action that repairs it.
  The worker did the right thing and it is worth naming as the pattern: it did NOT act on its own
  re-reading of the constraint, it handed the premise back with the evidence and left the call to the
  author. RULE: before a "doing X would break Y" clause enters a brief, MEASURE Y's current state and
  write the measurement beside the rule. And when you receive a constraint whose premise your own
  measurement contradicts, refuse to reinterpret it unilaterally — report the contradiction and ask.
