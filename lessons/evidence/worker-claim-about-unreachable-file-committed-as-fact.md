# `worker-claim-about-unreachable-file-committed-as-fact` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

- **`worker-claim-about-unreachable-file-committed-as-fact`** — A subagent's finding is UNVERIFIED BY ME
  no matter how well that subagent measured it, and relaying it to the owner without saying whose
  measurement it is turns their evidence into my assertion. Measured: I told the owner flatly that
  `check:a11y` is red for PRE-EXISTING reasons and not because of the branch under review, and that it
  would redden `ci:checks` regardless — a worker's result. I ran no gate, opened no story, and marked
  nothing. The owner allocates work from exactly that kind of sentence: if it were wrong they would
  either open a task for a defect that does not exist or wave through a regression the branch actually
  caused. Root cause: a worker report arrives ALREADY SHAPED LIKE A VERDICT, with ratios, file names
  and exit codes, so relaying it FEELS like reporting rather than asserting — and the marking step gets
  skipped precisely where the claim is most decision-bearing. **RULE: when passing a worker's finding
  to the owner, either verify it myself or name whose measurement it is IN THE SAME SENTENCE.** One
  clause, no cost. Without it, an inherited verdict is indistinguishable from one I established — and
  that is the same defect as forwarding somebody else's search under a `MEASURED:` marker, which this
  contract already forbids one rule above.

  **SECOND FACE — A CLAIM ABOUT SOMEONE ELSE'S ARTEFACT, RELAYED AS AN ORDER**
  (`worker-claim-about-unreachable-file-committed-as-fact`). The rule above is about relaying a
  worker's finding to the OWNER. This is the same defect pointed at another worker, where it does more
  damage, because a report invites judgement and an instruction removes it. Measured 2026-09-10: one
  agent reported that a second agent's design artefact "still carries 179 in §5 and §9". I forwarded
  that to the designer as a correction to make, quoting section text I had never opened. The designer
  read its own artefact, found **177** in §5 and **180** in §9, and refused — and it was right to.
  Had it complied, the edit would have overwritten a MEMBER count with a GOLDEN DECLARATION count,
  which are different quantities (177 public members; 180 = 177 + constructor + `ɵfac` + `ɵprov`),
  corrupting both.
  The root is that such a claim is **doubly unverified**: unverified by me, and possibly written
  against a revision that no longer exists — the report described revision 3 while the artefact was
  already at revision 4. **Artefacts move while reports travel**, and a living document has no single
  text to be right about.
  RULE: never relay a claim about the CONTENT of an artefact as an instruction without reading that
  artefact at its CURRENT revision. Passing a finding along as a report is cheap and honest — the
  recipient can weigh it. Passing it as an order transfers your certainty and removes their judgement,
  so the verification burden RISES rather than falls. Where reading is not possible, name the revision
  the claim was made against and ask the recipient to check it, which is the whole difference between
  "make this edit" and "this was reported against rev 3, confirm before acting".

  **THIRD FACE — A PREDICTION RECORDED AS A FACT, and it is the least verifiable claim there is**
  (`worker-claim-about-unreachable-file-committed-as-fact`). The two faces above are about a worker's
  MEASUREMENT reaching the owner unmarked. This one is about a worker's claim that nothing has happened
  yet: a statement about the FUTURE, for which no measurement can exist, arriving inside a report so
  full of real receipts that it inherits their authority.
  Measured 2026-09-10. A worker closed an otherwise excellent report with: *"the main checkout still
  holds the Angular 19.2.0 tree that produced your red. Harmless — the fixed gate wipes it on the next
  run."* I wrote that into the durable memory store as fact. Fifteen minutes later I ran the gate: the
  wipe hit **EPERM on three directories Windows would not unlink**, left the fixture's `node_modules`
  at ONE entry with the package gone, and the gate exited 1 with a misleading `ENOENT` about
  `@base100/b100-am-ui` — which reads like a packaging defect and is not one.
  RULE: **a prediction may never enter a durable record as fact.** Either run the thing and record the
  result, or write it as the author's expectation using a word that says so. The tell is grammatical
  and easy to catch once named — a future tense, "will", "on the next run", "once it re-runs".
  And on THIS machine one prediction is never safe: **any claim that a directory removal will succeed.**
  Windows cannot unlink a file a process holds, and a wipe interrupted halfway leaves a tree that is
  neither the old one nor the new one — the same mechanism that destroyed the shared `node_modules`
  and got `npm ci` banned here. A removal is a prediction until it has been read back.

  **FOURTH FACE — A PLAN READ BACK AS A ROSTER, and no worker was involved at all**
  (`worker-claim-about-unreachable-file-committed-as-fact`). The three faces above launder someone
  else's claim. This one launders my own intention. Measured 2026-09-13: I told the owner seven agents
  were running and named one as "the one regenerating the deck". No such agent was ever launched — the
  launch receipts in that session show six — and the deck is deliberately held for the FINAL step,
  which I had written myself two messages earlier. A planned step slid into the list of running work
  because the list was written from momentum. The owner plans capacity and waiting time from exactly
  that line.
  RULE: **a statement of what is running is assembled from receipts, never recited from the plan.** The
  receipts are the launch/resume results in this session, or the harness store
  `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.meta.json` with transcript mtimes. If I
  cannot point at the receipt for an entry, it does not go on the list. And a status line that grows by
  one between two messages with no launch in between is the tell.

  **FIFTH FACE — "THE HOOK COVERS IT", RELAYED AS A CLOSURE**
  (`worker-claim-about-unreachable-file-committed-as-fact`). Measured 2026-09-14. A worker reported
  task #127 CLOSED 8/8: the brief-provenance guard had been "widened to SendMessage". I carried that
  into my session summary, and from there into a reconciliation brief under `MEASURED:`. The
  reconciler refuted it, and I confirmed in two reads. The guard is registered only under
  `"matcher": "Agent|Task"` (`.claude/settings.local.json:790`). It reads `tool_input.prompt`
  (`guard.mjs:332`), while `SendMessage` carries its text in `message`. Its self-test passed because
  it built payloads with `prompt`, a shape SendMessage never sends. Widening the tool set inside the
  code changed nothing that fires.
  RULE: **whether a hook covers a tool is decided by exactly two things, and a closure claim must
  show both.** First, the registration matcher that routes that tool to the hook. Second, a
  REAL-SHAPED payload for that tool, captured from the harness rather than typed from memory, going
  through the hook with the expected verdict. A diff inside the hook's own code proves neither. A
  self-test whose fixtures invent the payload shape proves only that the code handles the invented
  shape.
  **SIXTH FACE — A REFUSED ACTION REMEMBERED AS A DONE ONE, and it leaves a stronger false memory
  than a merely planned step** (`worker-claim-about-unreachable-file-committed-as-fact`). The fourth
  face is a plan sliding into a roster. This one begins with an act genuinely performed: the tool WAS
  called, a guard REFUSED it, I cleared the blocker — and never re-issued the call. Measured
  2026-09-21: the orphan-work guard refused an `Agent` launch twice; I closed the block properly by
  declaring two generated directories in the reproducible-paths table, then went straight to composing
  the reply and told the owner the investigation *"va delegado con las dos hipótesis separadas"*. No
  launch receipt existed. The one gate blocking a 64-commit stack had nobody on it for about an hour,
  and the owner's next question — not any control — is what surfaced it.
  Why this is worse than forgetting: a refusal leaves the INTENT satisfied. You did reach for the
  action, so recalling "I delegated that" is accurate about the attempt and wrong about the effect.
  Clearing the blocker deepens it, because the work of unblocking feels like the work of launching.
  RULE, two halves. **After a refused tool call, the RETRY is the next action** — before any
  reporting, any summary, any other task. An unblocked refusal that is not immediately re-issued is a
  dropped action wearing the costume of a completed one. And the fourth face binds unchanged: a status
  line naming work as delegated or running is assembled from THIS turn's launch receipts, never from
  the brief you wrote. If you cannot point at the receipt, the entry does not go on the list.
  **SEVENTH FACE — A WORKER'S OPEN QUESTION FORWARDED AS WORK FOR THE OWNER**
  (`worker-claim-about-unreachable-file-committed-as-fact`, eighth occurrence). Measured 2026-09-22: a
  baseline worker wrote that `b100.stepper.previous` "renders the raw key, the translation is missing".
  I put that in the owner's follow-up list as a defect, and the owner ordered it fixed. The key ships in
  every locale (`b100-i18n-bundles.generated.ts:107/387/667/947`), and Storybook's
  `StubTranslateLoader` (`.storybook/preview.ts:81`) renders every key raw by design. Engram #849
  had refuted the same claim the day before. The store that held the verdict was one search away, and
  I never searched it, because a follow-up list FEELS like forwarding and not like asserting.
  RULE: **an item goes on the owner's work list only after an engram search for it and a read of the
  code in the same turn.** Otherwise it goes on the list marked as the worker's unverified claim. A
  defect list is an instruction to spend work; every entry in it is an assertion.

