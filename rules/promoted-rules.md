# Promoted rules — recurred despite the ledger, so they are binding

Cada clave conserva cada frase «RULE» LITERAL; el relato
medido de cada cara está completo en `~/.claude/lessons/evidence/<clave>.md` (no se carga solo: leerlo al tocar ese tema).

- **`bounded-search-read-as-absence`** — Reading ONE empty store as "no record exists". **A tool you lack is never the search that establishes absence.** Before saying a record does not exist, query every store that could hold it — and when the question is about project state, history, or what remains, query engram FIRST, because that is where this project deliberately puts what the tooling cannot keep.
  RULE: a document asserting "X does not exist" is a HYPOTHESIS inheriting somebody else's search, never a measurement — and it may never be forwarded to a worker under `MEASURED:`.
  RULE: a negative written into any DURABLE record must NAME THE STORES SEARCHED inside the record itself; where a store was not searched, say so rather than letting silence read as coverage.
  RULE: run `git fetch --all --tags` BEFORE asserting anything about tags, branches, or ahead/behind — a local ref query is never evidence about origin.
  RULE, operational: before writing any delegation brief, READ that task's own record in the harness task store; anything you would mark `HYPOTHESIS:` may already be MEASURED there.
  RULE: a tool returning nothing establishes only what THAT tool enumerates; before declaring any capability, actor or record gone, name what the tool you used actually covers, and ATTEMPT the recovery instead of reasoning about it.
  RULE: expanding ONE dependency graph establishes absence only within THAT graph — before saying anything does not gate a release, enumerate every gating surface it actually passes through.
  RULE: whether a chain reaches a script is a question with an owning tool (`check:ci-scripts` / `ci-build-completeness`) — ask it, never a hand parse of one member.
  RULE: for any question about a POPULATION of files, derive the population from the tool's own config, never from a directory you assumed; a negative must NAME THE PATHS SEARCHED inside the record.
  RULE: the progress of a multi-step run is read from its RUN DIRECTORY or its own `--read`/verdict reader, never from one step's log or a CPU cutoff.
  RULE: a worker's state is read from its branch head, dirty count and transcript mtime, measured in the same turn, never from the wording of a lifecycle notification. "No report yet" is not "no work yet".
  RULE: liveness is read from the actor's transcript mtime and last record, progress from `git log` of the repo, both in the same turn; a delivery-queued message proves nothing ran.
  RULE: una lista de capacidades del harness solo prueba lo que hay EN ESE TURNO; decir «no aparece en esta sesión», nunca «no existe».

- **`collision-fixed-by-deleting-unread-side`**
  RULE: before choosing a side, diff what each side uniquely HOLDS, not just what the gate will re-check; when both sides carry content, the resolution is a union you construct and verify, never a side you pick.
  RULE: act on what a finding SAYS, never on what its state name suggests.

- **`audit-verdict-from-commit-subjects-not-from-reading`** — A SEARCH may only LOCATE candidates. The VERDICT comes from reading the construct in its context, or from the tool that owns the semantics — a parser, the linter, `--print-config`, the gate itself.
  RULE: a task is CLOSED only against its own stated definition of done, read from the task record.
  RULE: a grep may only LOCATE a candidate — before any count becomes a claim, OPEN the hits and read them in context, or ask the tool that OWNS the semantics.
  RULE: a claim about what share of a file or list belongs to a category is made only after classifying every entry by reading it, and the sentence carries the count (N of M).
  RULE: "duplicate" is a share claim too — compare every entry against its supposed copy before proposing to remove or unload the set, and state how many are fully covered (N of M).
  RULE: before any verdict about a dependency, PARSE the manifest and name the SECTION the key lives in; the same package name in two sections answers two different questions.
  RULE: identify an actor by identity evidence — id, live status, start time, its worktree contents — never by subject matter.
  RULE: a census over a class counts DECLARATIONS, never deduplicated names, and any identifier class includes `$`.

- **`brief-marker-written-as-prose-not-literal-form`** — CLOSED BY MECHANISM 2026-09-09; this entry states the rule the mechanism enforces. A delegation brief must carry both provenance markers, and the check is: **the word `MEASURED` / `HYPOTHESIS` STARTS its own line, and that line carries a colon somewhere.** Guard `~/.claude/brief-provenance/guard.mjs`.
  RULE: every Agent prompt and every worker SendMessage is drafted FROM the skeleton — line 1 `MEASURED: …`, line 2 `HYPOTHESIS: …`, then the instruction — even a two-line resume; for a non-trivial brief run `node ~/.claude/brief-feasibility/preflight.mjs <draft>`, which runs every delegation guard in one pass, before sending.

- **`promotion-to-contract-read-as-prevention`** — Promoting a lesson into a binding contract is not the same as preventing it, and treating the promotion as the end of the work is how a "closed" lesson keeps firing. **RULE: a promoted rule prevents only the FACES ITS TEXT NAMES, never the lesson in the abstract.** So on every recurrence of an ALREADY-promoted key, do not re-record it — READ the existing contract text, decide whether this incident is a face that text already names, and when it is not, EXTEND the text with the new face in every file that carries it before promoting again.

- **`worker-claim-about-unreachable-file-committed-as-fact`** — A subagent's finding is UNVERIFIED BY ME no matter how well that subagent measured it, and relaying it to the owner without saying whose measurement it is turns their evidence into my assertion. **RULE: when passing a worker's finding to the owner, either verify it myself or name whose measurement it is IN THE SAME SENTENCE.**
  RULE: never relay a claim about the CONTENT of an artefact as an instruction without reading that artefact at its CURRENT revision; where reading is not possible, name the revision the claim was made against.
  RULE: a prediction may never enter a durable record as fact — either run the thing and record the result, or write it as the author's expectation. On this machine, no claim that a directory removal will succeed is ever safe.
  RULE: a statement of what is running is assembled from receipts, never recited from the plan; if you cannot point at the receipt for an entry, it does not go on the list.
  RULE: whether a hook covers a tool is decided by exactly two things — the registration matcher, and a real-shaped payload driven through it with the expected verdict. A diff inside the hook's own code proves neither.
  RULE: after a refused tool call, the RETRY is the next action, before any reporting. A status line naming work as delegated or running is assembled from this turn's launch receipts, never from the brief you wrote.
  RULE: an item goes on the owner's work list only after an engram search for it and a read of the code in the same turn; otherwise it goes on the list marked as the worker's unverified claim.
  RULE: before relaying a worker's activation, deploy or rollout plan, measure the environment premises it rests on (default branch, branches in use, roles and permissions, schedules) in the same turn, or mark them unverified.
  RULE: a state claim taken from any durable record (engram, backlog, report) is re-measured in the same turn before it reaches the owner, or goes out naming the record and its date in the same sentence; and before relaying it, check newer records on the same subject for a contradiction.
  RULE: before reporting a worker's write as done, read each artefact it claims to have changed, at its current revision, and check the claimed change is there; a status flag proves the process ran, never what it wrote.

- **`provisioning-bound-to-delegation-not-worktree-creation`** — A worktree you create YOURSELF arrives with no `node_modules`, because the provisioner is bound to DELEGATION (a `PreToolUse` hook on `Task|Agent`), never to worktree creation. **RULE: after any `git worktree add` you performed yourself, give the new worktree its dependencies BEFORE running a single gate there** — and never read a gate failure in a fresh worktree as a verdict about the code until `node_modules` is confirmed present.

- **`gitignored-deliverable-destroyed-by-worktree-autoclean`** — CLOSED BY MECHANISM 2026-09-16. **THE RULE, a shared predicate rather than a habit:** the question a removal decides is "if this worktree were deleted right now, what would be gone for good?", answered in ONE place (`.claude/worktree-work/worktree-work.mjs`) that every consumer asks. **Anything ignored and UNDECLARED counts as work** — a path is exempt only where a declaration names the process that produces it.

- **`brief-contradicted-a-standing-project-rule`** — A brief I write outranks nothing: the project's standing rules do.
  RULE: before fixing the FORM of a deliverable in a brief (commit shape, language, where it lands), check it against the project rules for that area; never extend a rule to a surface it does not name from a guess (apply its evident intent or ask); and never relay an unmeasured worker claim as the basis of a brief.

- **`instructed-a-worker-to-run-a-denied-command`**
  RULE: before any command goes into a brief, check it against the worker's real environment (deny list, blocking hooks, its pinned worktree) and name the alternative that works. A worker never changes worktree: moving work onto a new base is the orchestrator's step (cherry-pick into the new worktree from the main checkout), followed by a worker whose TENANCY names that worktree from launch. Every tooling command in a brief uses the main checkout's ABSOLUTE path. Mechanism: `~/.claude/brief-feasibility/`.
  RULE: when a brief authorises an outcome that a deny rule guards, it names the exact working route and the refused ones, and a "do not retry another way" clause is scoped to the action it protects, never written as a blanket.

- **`shell-one-liner-corrupted-data`**
  RULE: text edits with escapes, backslashes or template literals go through the Edit tool or a `.mjs` file, and after any scripted edit the expected marker is counted before anything relies on it.

- **`brief-had-workers-open-every-image`**
  RULE: a long-running worker gets an IMAGE BUDGET stated in its brief — at most 4 contact sheets per run, its own captures only, each first checked by a DOM assertion and the PNG size at capture time — and reviewing a body of existing images is a separate short-lived unit whose only job is that review.

- **`integrated-a-range-without-running-its-cheap-gates`** — Every integration onto `develop` runs every gate that can READ the changed paths, never a gate list I chose. **A hand-picked gate set is a bounded search written down as coverage.**
  RULE: after a cherry-pick, run the gates derived from the change (`vitest related` plus every `check:*` whose inputs include a touched path), or all of `ci:lint` + `ci:checks` when that is cheap enough, and read their real exit codes before calling the integration done.
  RULE: a gate deferred because a resource is busy is a HARD BLOCKER on landing, written into the plan as one; a change to shipped styles or tokens runs `check:a11y` BEFORE anything is stacked on it; and no ref move onto `develop`/`main` happens without a complete green verdict of the full chain for that exact tree.
  RULE: every fast-forward of develop requires a green `npm test -- --all` on that exact tree, on top of the related `check:*` gates; a list I pick is never the landing proof.
  RULE: a move whose content changes any `*.spec.ts` is also graded by `check:spec-typecheck`.

- **`acted-on-a-live-actors-working-state`**
  RULE: before committing, reaping, rebasing or otherwise acting on ANY worktree that is not mine, establish that its actor has STOPPED from the agent list, never from how finished the diff looks.
  RULE: commit with an explicit pathspec (`-- <paths>`, or `--only <paths>`) in ANY repo another actor may have touched, never a bare `commit` that sweeps the whole shared index.

- **`worker-overwrote-master-backlog`** — A delegated subagent may never write, update, or delete the project's master backlog (a `topic_key`/observation ending `-master`)
  RULE: the mandate now names its subject explicitly (the orchestrator only); a delegated agent puts its finding in its `SubagentHandback` report instead, and the orchestrator transcribes it into the backlog the same turn.

- **`landing-gate-run-on-a-tree-that-cannot-fast-forward`** — A landing-proof gate run (the whole gate chain invoked with no arguments, or the unit-suite floor `ci:test`) must REFUSE before a single gate starts, and before any verdict is written as `running`, when its tree cannot fast-forward the integration branch it means to prove.
  RULE: before any landing-proof gate run starts, ask git directly — `git merge-base --is-ancestor <integration branch> HEAD` — never trust a base named in a brief or remembered from an earlier turn.

- **`isolation-guard-screens-edits-but-not-shell-writes`** — CLOSED BY MECHANISM 2026-09-30 (b100-am-ui). A rule enforced on ONE write channel and absent on the other is not a rule. **POLICY, one rule:** an isolated worker writes ONLY inside its own worktree and its private scratch; main-checkout tooling is changed by a worker that is NOT isolated and whose brief carries a `TENANCY:` line naming it.
  RULE: before a brief authorises a write by absolute path, establish whether its worker is isolated; an isolated worker is never told to write the main checkout, and a policy about writes is decided over the write TARGETS of a call, never per tool, so every channel gets the same answer.

- **`unverified-commit-published-by-another-sessions-sync`**
  RULE: work in progress goes on a branch in its own worktree with no upstream, and reaches the shared branch only through `node ~/.claude/worktree-landing/land.mjs --worktree <dir> --main <dir> --branch <shared> --remote <remote>` (verifies in the worktree, then fast-forwards, pushes and reads the remote tip back); never commit to, merge into or fast-forward the shared branch by hand.
  RULE (face of 2026-10-11, Discovery): a project's `.claude/fleet-kit.json` `integrationBranches` names the branch work ACTUALLY lands on, the current batch branch first; a guard configured for a branch nobody integrates into governs nothing and refuses every honest delegation. When the batch branch changes, the configuration changes in the same turn.

- **`orchestrator-cwd-change-leaked-to-workers`**
  RULE: the main session runs a command in another directory with (1) absolute paths or `git -C <dir>`, (2) a `( cd <dir> && … )` subshell, or (3) `run_in_background`.

- **`backlog-rewritten-from-summary-lost-detail`** — CLOSED BY MECHANISM. A memory record is saved by EDITING its previous revision, never by re-summarising it: `mem_save` on an existing `topic_key` is a full upsert that REPLACES the content.
  RULE: a revision is the previous one edited; a finding enters with its measured detail and keeps it until closed with evidence.
  RULE: read the current revision (`mem_get_observation`) and resend it WHOLE plus the addition; to retire an item on purpose, write a line with a closure word (`CLOSED`, `CERRADO`, `SUPERSEDED`, `SUPERSEDIDO`) AND the item's first 6 words verbatim.
  RULE: an existing item is resent byte-identical; new facts go in their own paragraph or bullet; changing an item means a closure line for the old one plus the new one.
  RULE: (1) `mem_save` the old sections VERBATIM into a new record in the same project whose `topic_key` is the target's `topic_key` + `-archive` + a suffix (`backlog/1.0.0-master-archive-1`); (2) read the archive back (`mem_get_observation`) to get its id; (3) resend the target WITHOUT those sections, plus one line `ARCHIVED: #<archive id>` (several ids per line, comma-separated).

- **`contract-doc-names-a-mechanism-nobody-verifies`** — A path, script name, hook or wiring quoted from a memory or contract document is a HYPOTHESIS until the filesystem confirms it; confirm it before quoting it to a worker or to the owner, and fix the document in the same turn when it moved.

- **`delegated-role-toolset-narrower-than-its-contract`** — Before delegating to a named role, check that its declared toolset can satisfy its task: a role asked to MEASURE or VERIFY needs execution (Bash). When it cannot, fix the role definition, never work around it in the brief.

- **`blamed-the-tool-for-a-defect-i-built-into-the-command`** — When a tool appears to misbehave, reproduce the behaviour on a MINIMAL input you fully control first; a defect you cannot reproduce minimally is a hypothesis about your own usage, and an unreproduced tool defect is never written into a brief.

- **`replied-to-owner-in-english`**
  RULE: every visible line, interstitial narration included, is written in Rioplatense Spanish with the Gentleman tone; English appears only quoted, in a code block, or as a technical term.

- **`root-cause-stated-before-measured`**
  RULE: a claim about what code DOES — a root cause, a defect, a hang, a crash — is stated as fact only after the behaviour is reproduced on constructed state in the same turn; until then it is written as a hypothesis in the same sentence, to the owner and to a worker alike.
  RULE, this face: a mutant's behaviour is evidence about the mutant only; a brief's free prose carries no claim about product behaviour — such a claim goes on a `MEASURED:` line with the command that reproduced it, or on a `HYPOTHESIS:` line.

- **`brief-measured-line-carried-an-unmeasured-claim`** — A `MEASURED:` line carries only what a command in THIS turn measured.
  RULE: before a durable record's state claim (contract, memory, backlog) goes into a brief, re-measure it in the same turn and write the command beside it. Otherwise it goes under `HYPOTHESIS:` with the record and its date.
