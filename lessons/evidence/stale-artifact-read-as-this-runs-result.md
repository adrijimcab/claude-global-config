# `stale-artifact-read-as-this-runs-result` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

- **`stale-artifact-read-as-this-runs-result`** — Never interpret a results, exit-code, log, golden,
  or coverage artifact without first proving it belongs to THIS run: truncate or delete it in the same
  command that produces it, and REGENERATE whatever a gate derives from (`npm run build` before
  `check:api`, the full suite before coverage) before reading it. An artifact that outlives the run
  that made it is indistinguishable from this run's output, so a RED read off a stale artifact measures
  your execution order, not the tree. Recorded twice before it earned promotion — and then it RECURRED
  a third time WITH the rule already binding here, which is its own finding: this text did not stop it,
  so read the next paragraph as the part that has to do the work.
  **An ERROR, LIMIT, LOCK or QUOTA NOTICE is one of these artifacts too, and it is the one that slips
  through**, because it does not look like a file. Measured: a worker died with "you've hit your session
  limit, resets 1:50am" and I told the owner that relaunching now would fail the same way — asserted
  from the notice, with not one attempt to verify. The limit had already reset. A limit notice describes
  a window that EXPIRES; quoting it later states a capability is blocked using evidence that has gone
  out of date, which is exactly a stale read wearing different clothes. RULE: before asserting that
  something is still blocked, unavailable, rate-limited or locked, ATTEMPT IT — the attempt is nearly
  always cheaper than the claim — or say plainly that it is unverified. Never infer a CURRENT capability
  from a PAST refusal.
  **A PLAN IS AN ARTIFACT TOO, and it is the one that wastes other people's work.** The faces above
  are build outputs and expiring notices. This one is a BACKLOG record. Measured: I dispatched three
  agents to build three tasks straight from an engram snapshot dated three weeks earlier, reading it
  as the present. A reconciliation I launched IN PARALLEL later measured all three as already CLOSED,
  with receipts — two workers had already spent real effort before I could redirect them. A snapshot
  carries a date for a reason; the tasks it lists keep getting closed after it is written, and nothing
  updates it. RULE: before dispatching work from any record older than the current session, verify the
  specific items are still open. And when a reconciliation is needed at all, it runs BEFORE the work it
  scopes — never beside it, because a verdict that arrives after the delegation cannot prevent it.

  **A BUILD RUN TO SATISFY ONE PRECONDITION CAN INVALIDATE ANOTHER**
  (`stale-artifact-read-as-this-runs-result`). The faces above are about reading an artefact that
  outlived its run. This one is about CREATING that state while trying to fix it. Measured 2026-09-10:
  I ran `npm run build` — the LIBRARY — to clear one gate's stale-`dist` precondition, then ran the
  full 64-gate suite. It reported **8 of 64 failed**, and five of those eight said, in their own words,
  `PRECONDITION NOT MET — this is NOT a content finding`. The library build had invalidated the built
  DEMO, so every `:nobuild` demo gate and `check:initial-graph` graded an artefact that no longer
  matched the tree. Rebuilding the demo returned them to exit 0 with no code change at all.
  RULE: before reading a SUITE, enumerate every artefact its gates derive from and regenerate ALL of
  them — not just the one that was complaining. A repository with more than one build output has more
  than one way to be stale, and satisfying one is a change like any other.
  **The tell that caught it was not the exit code, it was the DISAGREEMENT.** Three of those five I had
  personally measured at exit 0 forty minutes earlier. A red set that contradicts a measurement you
  took yourself is a claim about execution ORDER, never about the tree — treat the contradiction as the
  finding and go looking for what moved between the two readings.
  Worth stating because it is the good news half: **the gates in this repository defend themselves.**
  They refuse to grade a stale artefact, exit `2` rather than `1`, and say so — one of them adds *"do
  not attribute it to your change or to a pre-existing failure"*. That is this rule built INTO the
  tool instead of entrusted to whoever reads it. A `2` from such a gate means nothing about the code; a
  `1` does.

  **TWO LIVE PRODUCERS, ONE PATH — and every remedy above is powerless against it**
  (`stale-artifact-read-as-this-runs-result`, sixth occurrence). Every face above concerns an artefact
  that OUTLIVED its run, and the remedy is always the same: truncate or regenerate in the same command
  that reads. That remedy does nothing here, because both producers are ALIVE and both are truncating.
  Measured 2026-09-16: a worker's pre-limit gate run was still running when it relaunched after the
  quota reset. Both wrote `…/scratch/<agent>/gates/summary.txt`. I read the result as one clean chain —
  `check:api EXIT=2`, then `build EXIT=0`, then eleven gates at `0` — and reported it to the owner as
  textbook resume-forward behaviour. It was interleaving from two runs: the `2` came from one run
  reading `dist/` while the other rebuilt it. **The worker refuted me**, not any control. Nothing in
  the file was corrupt, nothing was stale, and every line was true of SOME run — which is exactly why
  it reads as a result.
  ROOT, and it is architectural rather than careless: workers hand-roll a gate runner into a FIXED
  scratch path with no run identity, while this repository ALREADY solved it correctly one directory
  away — `.claude/integrate/run-record.mjs` mints `newRunId(now, pid)` and states in its own header
  that each run gets "a directory nobody else writes". A correct solution the actors who need it cannot
  reach is not a solution.
  RULE: **an artefact is attributable to a run only when its PATH carries a run id.** A shared
  fixed-path log may never be read as one run's result — not its exit codes, not its tail, not its
  summary — however clean it looks. Before reading any run artefact, confirm the path is unique to that
  run; and before launching a long run, establish that no earlier one is still alive. The cheap probe
  is a process burning CPU since the log's creation minute; an EMPTY log proves nothing either way,
  because a buffered linter and a corpse look identical.

  **TWO LIVE PRODUCERS, ONE PORT — the same defect on a resource that is not a file**
  (`stale-artifact-read-as-this-runs-result`, seventh occurrence). Measured 2026-09-21: I let a worker
  run `check:a11y:nobuild`, which serves Storybook, while the 82-gate integration chain was running its
  own `check:a11y`. The chain's gate stopped at `Port 6006 is already in use — a stale server is
  running. Kill it first; refusing to test against unknown content.` It graded NOTHING, and the chain's
  attribution then labelled that red "pre-existing" — a replay under the same occupied port, so the
  label measured my fleet, not the tree. The PATH rule above could not have caught it: a port carries no
  run id either, and it is shared by every process on the machine rather than by one directory.
  ROOT: I scheduled work by TASK and never by the exclusive RESOURCES each task holds. RULE: before
  launching or resuming a worker while a long chain is live, name the exclusive resources both touch —
  Storybook's port, the demo server's port, the shared `node_modules`, the main checkout — and forbid the
  overlap in the brief. And a precondition refusal is never evidence about the code, nor is an
  attribution replayed under the same contention. The good half, again: the gate refused to grade
  rather than inventing a result, so the harm was an hour of chain, not a false verdict.

  **ONE RUN DIRECTORY, TWO POPULATIONS OF LOGS** (`stale-artifact-read-as-this-runs-result`, eighth
  occurrence). Measured 2026-09-21: the integration run held the chain's own gate logs (001-083) and
  attribution's single-commit replays (9xx) in ONE `logs/` directory. I quoted `913-check_suppressions-
  ratchet` and `916-check_spec-typecheck` as the tip's result and briefed a worker on them; the chain's
  own logs said 316 vs 314 and four grown files. The worker refuted it by reproducing the chain's log.
  A replay describes ONE commit, never the tip. CLOSED BY MECHANISM: `.claude/integrate/run-record.mjs`
  now gives each run `logs/` (the chain only) and `replays/` (attribution only); `integrate.mjs` routes
  replays to the latter, and `integrate/selftest.mjs` asserts on every replayed incident that no replay
  sits in `logs/` and no chain log in `replays/`. RULE: read a gate's result from the run's
  `verdict.json` (`gates[].log`), never by picking a file out of a directory by name.

  **NINTH FACE — THE READER RESOLVED A DIFFERENT CHECKOUT'S STATE** (`stale-artifact-read-as-this-runs-result`,
  ninth occurrence). Measured 2026-09-28: I ran `node .claude/gate-run/gate-run.mjs --read` from the MAIN
  checkout, got a green 4-gate verdict (docs:sync-counters, docs:presentation, check:live-counters,
  check:presentation) and told the owner it was the coverage agent's run. The agent refuted it: its run
  `20260928-141640-39120` has 7 gates and none of those four. `--read` resolves the gate-run state of the
  directory it is LAUNCHED from; the question was about a different worktree. The verdict was real and
  complete, and about someone else. RULE: a worker's verdict is read with `--read` run INSIDE that worker's
  worktree, or through the explicit path of its `runs/<id>/verdict.json`; never from the main checkout,
  and the report names the worktree the verdict came from.


## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-30 — stale-artifact-read-as-this-runs-result: now a binding rule in the delegated-worker contract (both files); closed by mechanism .claude/gate-run/run-attribution.mjs (selftest run, exit 0); full incident history in .claude/failure-capture/state/incidents.jsonl <!--fc:stale-artifact-read-as-this-runs-result#10-->
