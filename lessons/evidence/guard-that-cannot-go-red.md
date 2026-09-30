# `guard-that-cannot-go-red` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

- **`guard-that-cannot-go-red`** — A new guard, gate, check or classifier is NOT trusted until it has
  been proven to DISCRIMINATE, on real cases, across the state space its decision ranges over. Two
  distinct faces, both mine, both nearly shipped as working: (1) a `Stop` guard filtered on a field
  name that did not exist, so every comparison saw `undefined`, the filter emptied, and a guard that
  COULD NOT FIRE produced output byte-identical to a clean fleet; (2) a close command passed an 11/11
  self-test and four real closes, then refused a fully-integrated worktree with a self-contradicting
  message — its classifier could not tell "the branch has content the trunk lacks" from "the trunk has
  content the branch lacks", and the earlier cases happened to contain only one of those states. So:
  silence from a check is evidence ONLY once that same check has been seen to speak; testing that a
  mechanism FIRES is not testing that it DECIDES CORRECTLY; and the states your first real cases
  happen to contain are not the states that exist. Enumerate the state space the decision ranges over
  and exercise each state in the self-test, so the discrimination cannot silently drift back.
  Recorded twice before it earned promotion, and a THIRD face arrived the moment a guard met reality.
  **THE NEAR MISS IS A STATE, and it is the one you will not think of**, because the state space that
  matters is defined by USAGE, not by the code's branches. Measured: a delegation guard requiring the
  literal markers `MEASURED:` / `HYPOTHESIS:` passed 14 self-test cases — both present, each missing,
  both missing, wrong tool, no prompt, four corruptions — and then REFUSED its author's very first
  real brief, which said `MEASURED (by me, on develop):`. The word was there, the meaning was there,
  the literal was not, because the colon landed after a parenthetical. Nobody had tested "tried and
  got the FORM wrong", which is precisely what a person satisfying a control actually does.
  Second half of the same defect: the refusal said only "missing" while the guard could SEE the bare
  word present, withholding the one fact that made the fix obvious. **A control that decides correctly
  but explains poorly gets routed around — the same end state as one that cannot fire, reached by a
  different road.** So: test the near miss, and make the refusal NAME it. Do not relax the form to
  make the message unnecessary; strictness is what stops a marker from being talked around.
  **FOURTH FACE, and it is the one that gets a guard switched off: RED FOR THE WRONG REASON.** A
  selftest whose fixture is LIVE MUTABLE STATE rots on its own. Measured 2026-09-02: the
  integration-guard selftest pinned its REAL INCIDENT cases by comparing the deck HTML blob at a
  historical tag against `develop`, asserting byte-identity — and went red the moment `develop`
  legitimately regenerated the deck four times. Nothing had regressed. The reasoning error sat in the
  test's own comment, which claimed an inversion meant "the discount has lost its basis"; false,
  because the discount rests on the three deck artifacts rendering from ONE model in ONE command — a
  property of a SINGLE regeneration, never of a frozen tag versus a branch that moves. A historical
  tag MUST diverge from the trunk; that is what historical means. So: a fixture is CONSTRUCTED by the
  test, never read from a branch, a tag's relationship to a branch, or any artifact that legitimately
  changes. A guard that reddens on a correct tree is worse than one that cannot fire — the first
  teaches people to turn it off, the second at least stays out of the way.
  **FIFTH FACE, and it is the one you BORROW rather than build: A PROBE YOU DID NOT AUTHOR.** The
  four above are guards someone wrote. This one is an ambient signal picked up and used as a
  discriminator without ever checking that it could discriminate. Measured: I refused to reap three
  worktrees because `.git/worktrees/<n>/locked` named a pid that `tasklist` reported alive — and all
  three named the SAME pid, the session's own `claude.exe`. That probe answers "alive" for every
  worktree that will ever exist; it has no NO to give. The refusals looked like caution and were
  noise, while the real discriminator sat right there: what each branch still owes the trunk, plus
  its dirty count. RULE: before any probe becomes a decision signal, exercise the state in which it
  MUST say no. A borrowed signal gets the same treatment as a guard you wrote, because the question
  is not who built it — it is whether its answer can vary with the thing you are deciding.
  **SIXTH FACE — THE DISCRIMINATOR THAT ANSWERS A DIFFERENT QUESTION, and it passes as diligence
  because it is genuinely careful work.** The five above either cannot fire, cannot vary, or fire
  wrongly. This one fires correctly and answers something you were not deciding. Measured: I reaped a
  LIVE worker's worktree and deleted its branch mid-verification — `git worktree remove --force`
  wiped the directory and `git branch -D` left its commit DANGLING and GC-eligible, reachable only by
  SHA; the work survived solely because I had told that worker to commit first. I had run a careful
  check beforehand — "does this branch hold content the trunk lacks?" — and got a correct NO. But a
  reap decides OCCUPANCY, and nothing I ran answered that. **A check being rigorous, and its answer
  being true, says nothing about it bearing on the decision.** Name the question the action decides,
  in words, BEFORE choosing the probe — and when a decision has two independent preconditions,
  satisfying one is not evidence about the other.
  The second half is how the real signal got past me, and it generalises: **a machine STATUS FIELD
  outranked the actor's own sentence.** The harness said `completed` — which means the agent stopped
  this turn, and its own note says the same task may notify again — while the agent's report text
  said it was "waiting on the fresh verification run to land". It declared itself unfinished and I
  read the field instead of the words. So: when a status and a first-hand account disagree about
  whether work is finished, the account wins; a lifecycle field describes the process, never the
  task. And for anything destructive, prefer the reversible error — an unreaped worktree costs disk,
  a reaped live one costs work.
  **THE SIXTH FACE THEN RECURRED WITH THIS PARAGRAPH ALREADY BINDING**, so the next lines are the part
  that has to do the work. Measured 2026-09-09: dispatching five agents, I verified rigorously that
  each task was still OPEN — `check:visual-coverage` still exit 1 with 68 problems, `package.json`
  lines 295-296 still on the git URL — and every measurement was true. But a DISPATCH has two
  independent preconditions: is the task open, AND is there already work in flight for it. Two fresh
  agents went onto work already sitting finished and uncommitted in worktrees from a stopped fleet:
  the entire two-line deliverable of task #56, and 175 lines of the Docker baselines script. The
  OWNER caught it — "weren't these launched last night?" — no control did.
  The abstract principle was not enough because **parked work is invisible by construction**: not in
  `git status`, not in `git log`, and from the main checkout a loaded worktree looks identical to an
  empty one — same HEAD, same branch listing. So the operational rule, not the principle: **before any
  delegation, enumerate every worktree's uncommitted and unmerged content and READ the diff. OPEN is
  not the same as UNSTARTED.**
  The guard written to close it then failed on this same key twice over, which is why it was NOT
  shipped: its agent-liveness probe scanned process command lines, and measurement refuted it — of 8
  live `node`/`claude` processes, ZERO name any worktree, because agents run in-process in the
  harness. A probe with no NO to give (fifth face) that reddens over a live agent (fourth face). That
  discriminator belongs on `.claude/agent-worktree-lifecycle/occupancy.ts`, which already owns the
  question, never on a process scan.
  **SEVENTH FACE — THE GUARD THAT FORBIDS WRITING ABOUT ITSELF, and it fires within minutes of
  shipping.** Measured 2026-09-09: the new toolchain guard, built to deny the shared-tree wipe,
  denied a heredoc that was writing the agent contract DESCRIBING that denial — the forbidden text sat
  in the heredoc BODY, which is data being written to a file, not a command being run. I had
  enumerated the state space from the COMMAND's shapes: flags, chained `cd`, the Windows shim, the
  fused semicolon, and the `npm run ci:lint` near miss that would have got the guard switched off. I
  never enumerated the shapes an author produces immediately AFTER a prohibition ships, and
  **documenting the new rule is the first of them** — every prohibition is followed by writing about
  the prohibition, in contracts, in memory, in the refusal message itself. RULE: when a guard forbids
  a token, its self-test must exercise that token appearing as DATA — heredoc bodies, quoted strings,
  echoed text, commit messages — and must also prove the scan RESUMES afterwards, or stripping the
  data silently swallows the real command that follows it. This is the third face wearing new clothes:
  a control that blocks legitimate work gets switched off the same day, which is the
  `guard-that-cannot-go-red` end state reached by yet another road.
  **EIGHTH FACE — THE IDENTITY GUARD THAT READ THE LABEL, NOT THE ERRAND**
  (`guard-that-cannot-go-red`). Measured 2026-09-14: `resume-before-fresh` stayed silent while I
  launched a fresh "Fix the 18 failing check:a11y suites at root" over `a153f28c` ("Close the
  accessibility gates"), which was 87h old with its worktree alive and 32 analyses of the same rules in
  its transcript. The owner caught it. Two blind spots, both measured: the guard compared 5-word
  DESCRIPTIONS word by word, and `a11y` and `accessibility` share nothing a word comparison sees (0
  shared); and it ignored anything older than 24h, although a live worktree means the context is on
  disk whatever the clock says. Its state space covered rewordings, near misses and age, but never the
  same errand in different VOCABULARY, which is how real authors write.
  RULE: an identity guard compares what the author actually wrote (the BRIEF, not the label), folds the
  domain's own spellings (numeronyms, plurals), and treats a live worktree as overriding recency. Where
  the signal is too weak to REFUSE without blocking legitimate work, the guard must still SURFACE the
  candidate. Silence is not the only alternative to a false refusal. Fixed:
  `relatedLiveAgents` advises (never denies) when a live worktree's whole errand appears inside the new
  brief, and the self-test now carries this incident as its first advisory case (26/26, with the live
  store probe flagging `a153f28c` and staying silent on an unrelated control).
  **NINTH FACE — THE FIXTURE ALPHABET HID THE UNIT MISMATCH** (`guard-that-cannot-go-red`). Measured
  2026-09-14: the engram-persistence Stop guard refused TWICE, each time straight after a real
  post-commit save (#744, #762). It stored its offset as `statSync().size`, which is BYTES, then cut the
  DECODED transcript with `text.slice(offset)`, which counts CHARACTERS. The live transcript carried
  459,662 bytes of multi-byte text (Spanish accents, box-drawing), so the cut landed past the end and
  returned an empty tail. An empty tail never contains a save, so the guard went red on every commit.
  Its self-test used ASCII-only fixtures, the one alphabet where bytes and characters are the same
  number, so it could not see the defect. The first refusal I dismissed as "probably flush timing"
  without measuring. The second stopped the line, and one probe of byte positions found the cause.
  RULE: **a value measured in one unit is applied in that unit**: a byte size cuts bytes
  (`Buffer.subarray`), never a decoded string. **A fixture is chosen for the data the guard will really
  read**: a guard over transcripts, logs or user text is tested with multi-byte content larger than the
  window it slices. Fixed and proven: self-test 12/12 including the multi-byte save case seen RED first,
  plus a replay of the real refused stop against the live transcript, which now allows.
  **TENTH FACE — "AM I BLOCKED RIGHT NOW" ANSWERING "IS THIS FINISHED", and the only witness was a
  count that did not add up** (`guard-that-cannot-go-red`, eleventh occurrence). Measured 2026-09-17: I
  hand-rolled a cherry-pick resolution loop whose in-progress predicate was
  `git rev-parse --verify CHERRY_PICK_HEAD`. That flag exists ONLY while a pick is STOPPED AT A
  CONFLICT; between two clean commits of a range it is absent. The loop therefore exited after the first
  successful `--continue` and printed `PICK COMPLETO` with **4 of 10 commits applied**. Nothing was
  corrupt, no command failed, and the message was confident. What caught it was arithmetic: the stack
  held 15 commits where 21 were due, and the sequencer's own todo still listed seven.
  RULE: **the completion of a multi-item operation is verified by COUNTING what landed against what was
  asked** — never by a state flag, because a flag that marks one interruption cannot distinguish
  "between items" from "done". And prefer the tool that already owns the operation: this project's
  `.claude/integrate/staging-worktree.mjs` `pickOnto` picks ONE commit at a time and checks each status,
  which is exactly why the production path does not have this defect and my ad-hoc loop did. A
  hand-rolled reimplementation of an operation the repository already automates is where this class of
  bug is born.
  **The first face, again, in a throwaway script** (`guard-that-cannot-go-red`, twelfth occurrence).
  Measured 2026-09-21: classifying lesson closures, I read `record.mechanism` - a field that does not
  exist; promotion records carry it inside `record.closure`. The script printed `mecanismo: 0` over 21
  keys, and only the contradiction with a promotion I had watched land minutes earlier caught it. The
  same turn then produced a second face of the same defect: a Python edit whose anchor did not match
  aborted, the next command ran anyway, and `capture.mjs promote` reported success because it verifies
  only that the key's TOKEN is present - which it already was. RULE, operational: **before any script
  reads a field, print the DISTINCT FIELD SETS of the real records in one command and read from what is
  there**; and **a chain whose later step certifies an earlier one must stop when the earlier one
  fails** - never `;` or a newline between an edit and the command that vouches for it.
  **THE PROOF TOOL ITSELF COULD NOT GO RED** (`guard-that-cannot-go-red`, thirteenth occurrence).
  Measured 2026-09-21: the shared mutation runner counted any non-zero selftest exit as a kill and
  never ran the selftest UNMUTATED first, so a campaign whose selftest was already red reported N/N.
  `fleet-env/worktree-hooks` showed 13/13 over a baseline red on 7 of 44 cases since it was written (a
  file the selftest needs was never copied into the sandbox); `worktree-work` 23/23 over a baseline
  made red by live repository state. I had cited both as discrimination proofs. CLOSED BY MECHANISM:
  `.claude/mutation-proof/run-mutants.mjs` requires a green unmutated baseline (exit 2 otherwise), an
  exactly-once target and a parse-clean mutation; its own selftest and a self-mutation campaign prove
  each refusal. RULE: a kill measured over a red baseline is not evidence, and a proof is only as good
  as the runner's ability to refuse to measure.


## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-29 — guard-that-cannot-go-red: now a binding rule in the delegated-worker contract (both files); closed by mechanism .claude/entry-point-check/check.mjs (selftest run, exit 0); full incident history in .claude/failure-capture/state/incidents.jsonl <!--fc:guard-that-cannot-go-red#14-->
