# Promoted rules — recurred despite the ledger, so they are binding

Fuente: sección «Promoted rules» de `~/.claude/CLAUDE.md`, condensada el 2026-09-28 por decisión del dueño.
Cada clave conserva su enunciado ENTERO, el título de cada cara y cada frase «RULE» LITERAL; el relato
medido de cada cara está completo en `~/.claude/lessons/evidence/<clave>.md` (no se carga solo: leerlo al tocar ese tema).

- **`stale-artifact-read-as-this-runs-result`** — Never interpret a results, exit-code, log, golden,
  or coverage artifact without first proving it belongs to THIS run: truncate or delete it in the same
  command that produces it, and REGENERATE whatever a gate derives from (`npm run build` before
  `check:api`, the full suite before coverage) before reading it. An artifact that outlives the run
  that made it is indistinguishable from this run's output, so a RED read off a stale artifact measures
  your execution order, not the tree. Nine faces recorded to date:
  - **AN ERROR, LIMIT, LOCK OR QUOTA NOTICE is one of these artifacts too.** RULE: before asserting
    that something is still blocked, unavailable, rate-limited or locked, ATTEMPT IT — the attempt is
    nearly always cheaper than the claim — or say plainly that it is unverified. Never infer a CURRENT
    capability from a PAST refusal.
  - **A PLAN IS AN ARTIFACT TOO.** RULE: before dispatching work from any record older than the
    current session, verify the specific items are still open; a reconciliation runs BEFORE the work
    it scopes, never beside it.
  - **A BUILD RUN TO SATISFY ONE PRECONDITION CAN INVALIDATE ANOTHER.** RULE: before reading a SUITE,
    enumerate every artefact its gates derive from and regenerate ALL of them — not just the one that
    was complaining.
  - **The tell is DISAGREEMENT, not the exit code**: a red set that contradicts a measurement you took
    yourself is a claim about execution ORDER, never about the tree. The gates in this repository
    defend themselves — several exit `2` rather than `1` when they refuse to grade a stale artefact; a
    `2` means nothing about the code, a `1` does.
  - **TWO LIVE PRODUCERS, ONE PATH.** RULE: an artefact is attributable to a run only when its PATH
    carries a run id; before launching a long run, establish that no earlier one is still alive.
  - **TWO LIVE PRODUCERS, ONE PORT** — the same defect on a resource that is not a file. RULE: before
    launching or resuming a worker while a long chain is live, name the exclusive resources both touch
    and forbid the overlap in the brief.
  - **ONE RUN DIRECTORY, TWO POPULATIONS OF LOGS.** RULE: read a gate's result from the run's
    `verdict.json` (`gates[].log`), never by picking a file out of a directory by name.
  - **THE READER RESOLVED A DIFFERENT CHECKOUT'S STATE.** RULE: a worker's verdict is read with
    `--read` run INSIDE that worker's worktree, or through the explicit path of its
    `runs/<id>/verdict.json`; never from the main checkout, and the report names the worktree the
    verdict came from.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/stale-artifact-read-as-this-runs-result.md`.

- **`guard-that-cannot-go-red`** — A new guard, gate, check or classifier is NOT trusted until it has
  been proven to DISCRIMINATE, on real cases, across the state space its decision ranges over. Silence
  from a check is evidence ONLY once that same check has been seen to speak; testing that a mechanism
  FIRES is not testing that it DECIDES CORRECTLY. RULE: enumerate the state space the decision ranges
  over and exercise each state in the self-test, so the discrimination cannot silently drift back. Ten
  faces recorded to date; each adds one more state that belongs in that enumeration:
  - **THE NEAR MISS IS A STATE.** RULE: test the near miss, and make the refusal NAME it — do not
    relax the form to make the message unnecessary; strictness is what stops a marker from being
    talked around.
  - **RED FOR THE WRONG REASON.** RULE: a fixture is CONSTRUCTED by the test, never read from a
    branch, a tag's relationship to a branch, or any artifact that legitimately changes.
  - **A PROBE YOU DID NOT AUTHOR.** RULE: before any probe becomes a decision signal, exercise the
    state in which it MUST say no — a borrowed signal gets the same scrutiny as a guard you wrote.
  - **THE DISCRIMINATOR THAT ANSWERS A DIFFERENT QUESTION.** RULE: name the question the action
    decides, in words, BEFORE choosing the probe; when a decision has two independent preconditions,
    satisfying one is not evidence about the other. It recurred twice more: when a status and a
    first-hand account disagree about whether work is finished, the account wins — a lifecycle field
    describes the process, never the task; and before any delegation, enumerate every worktree's
    uncommitted and unmerged content and READ the diff — OPEN is not the same as UNSTARTED.
  - **THE GUARD THAT FORBIDS WRITING ABOUT ITSELF.** RULE: when a guard forbids a token, its self-test
    must exercise that token appearing as DATA — heredoc bodies, quoted strings, echoed text, commit
    messages — and must prove the scan RESUMES afterwards.
  - **THE IDENTITY GUARD THAT READ THE LABEL, NOT THE ERRAND.** RULE: an identity guard compares what
    the author actually wrote (the brief, not the label), folds the domain's own spellings, and treats
    a live worktree as overriding recency; where the signal is too weak to refuse, it must still
    surface the candidate.
  - **THE FIXTURE ALPHABET HID THE UNIT MISMATCH.** RULE: a value measured in one unit is applied in
    that unit — a byte size cuts bytes, never a decoded string; a fixture is chosen for the data the
    guard will really read.
  - **"AM I BLOCKED RIGHT NOW" ANSWERING "IS THIS FINISHED".** RULE: the completion of a multi-item
    operation is verified by COUNTING what landed against what was asked, never by a state flag;
    prefer the tool that already owns the operation. Operational corollary: before any script reads a
    field, print the DISTINCT FIELD SETS of the real records first; a chain whose later step certifies
    an earlier one must stop when the earlier one fails.
  - **THE PROOF TOOL ITSELF COULD NOT GO RED.** RULE: a kill measured over a red baseline is not
    evidence, and a proof is only as good as the runner's ability to refuse to measure.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/guard-that-cannot-go-red.md`.

- **`bounded-search-read-as-absence`** — Reading ONE empty store as "no record exists". **A tool you
  lack is never the search that establishes absence.** Before saying a record does not exist, query
  every store that could hold it — and when the question is about project state, history, or what
  remains, query engram FIRST, because that is where this project deliberately puts what the tooling
  cannot keep. The failure is cheap to avoid and expensive to make: the owner plans from the answer.
  Recorded across many recurrences; each face below adds one more search surface that silence alone
  does not cover:
  - **A DOCUMENT IS NOT A SEARCH.** RULE: a document asserting "X does not exist" is a HYPOTHESIS
    inheriting somebody else's search, never a measurement — and it may never be forwarded to a worker
    under `MEASURED:`. Search every place the thing could live, including outside the repository,
    before writing an absence down.
  - **THE RULE NAMED THE STORE AND I STILL DID NOT OPEN IT.** RULE: a negative written into any
    DURABLE record must NAME THE STORES SEARCHED inside the record itself; where a store was not
    searched, say so rather than letting silence read as coverage.
  - **GIT'S LOCAL REF STORE IS A CACHE, NOT THE REPOSITORY.** RULE: run `git fetch --all --tags`
    BEFORE asserting anything about tags, branches, or ahead/behind — a local ref query is never
    evidence about origin.
  - **A BRIEF IS ASSEMBLED FROM THE TASK RECORD, NEVER AUTHORED FROM MY OWN SUMMARY.** RULE,
    operational: before writing any delegation brief, READ that task's own record in the harness task
    store; anything you would mark `HYPOTHESIS:` may already be MEASURED there.
  - **A CAPABILITY DECLARED ABSENT FROM ONE TOOL'S SILENCE.** RULE: a tool returning nothing
    establishes only what THAT tool enumerates; before declaring any capability, actor or record gone,
    name what the tool you used actually covers, and ATTEMPT the recovery instead of reasoning about
    it. CLOSED BY MECHANISM: `.claude/resume-before-fresh/guard.mjs`.
  - **THE RIGHT SEARCH OF THE WRONG SURFACE.** RULE: expanding ONE dependency graph establishes
    absence only within THAT graph — before saying anything does not gate a release, enumerate every
    gating surface it actually passes through.
  - **ONE MEMBER OF A CHAIN PARSED, THE WHOLE CHAIN ASSERTED.** RULE: whether a chain reaches a script
    is a question with an owning tool (`check:ci-scripts` / `ci-build-completeness`) — ask it, never a
    hand parse of one member.
  - **THE GLOB'S PATH SCOPE IS THE POPULATION.** RULE: for any question about a POPULATION of files,
    derive the population from the tool's own config, never from a directory you assumed; a negative
    must NAME THE PATHS SEARCHED inside the record.
  - **A PART PROBED, THE WHOLE DECLARED.** RULE: the progress of a multi-step run is read from its RUN
    DIRECTORY or its own `--read`/verdict reader, never from one step's log or a CPU cutoff.
  - **THE NOTIFICATION DESCRIBES THE REPORT, NOT THE BRANCH.** RULE: a worker's state is read from its
    branch head, dirty count and transcript mtime, measured in the same turn, never from the wording
    of a lifecycle notification. "No report yet" is not "no work yet".
  - **«QUEUED» IS NOT «RUNNING», AND A SHRINKING COUNT IS NOT A COMMIT (2026-09-30,
    `bounded-search-read-as-absence`).** I told the
    owner twice that a migration agent was live and "committing path by path (19 -> 1)" and dismissed
    a guard on that basis; its transcript had last written hours earlier (context-exhausted, a
    dangling tool_use), my SendMessage had only been "queued for its next tool round", and git held
    zero commits from it — the count moved because the guard attributed differently between turns.
    RULE: liveness is read from the actor's transcript mtime and last record, progress from `git log`
    of the repo, both in the same turn; a delivery-queued message proves nothing ran.
  - **LA LISTA DE SKILLS DE UN TURNO ES UNA FOTO.** RULE: una lista de capacidades del harness solo
    prueba lo que hay EN ESE TURNO; decir «no aparece en esta sesión», nunca «no existe».
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/bounded-search-read-as-absence.md`.

- **`collision-fixed-by-deleting-unread-side`** — Resolving a conflict by taking one whole side
  preserves only what you thought to check afterwards. **The asymmetry: a side-taking resolution
  loses exactly the content no gate verifies**, which is also the content a human wrote deliberately
  and nobody will notice missing. RULE: before choosing a side, diff what each side uniquely HOLDS,
  not just what the gate will re-check; when both sides carry content, the resolution is a union you
  construct and verify, never a side you pick.
  - **A STATE NAME IS NOT A DIAGNOSIS.** RULE: act on what a finding SAYS, never on what its state
    name suggests. Whenever the remedy might be "record, adopt or accept what is already there", read
    what is there FIRST — overwriting is not a neutral default.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/collision-fixed-by-deleting-unread-side.md`.

- **`audit-verdict-from-commit-subjects-not-from-reading`** — A SEARCH may only LOCATE candidates. The
  VERDICT comes from reading the construct in its context, or from the tool that owns the semantics —
  a parser, the linter, `--print-config`, the gate itself. This is the project's own "grep localiza,
  NO dictamina" raised to a binding rule. **The asymmetry that makes this binding: a search that
  MISSES is silent, and a search that COLLIDES looks like a hit.** Both read as evidence and neither
  is. So when a search result contradicts a claim someone reached by READING, the search is wrong
  until proven otherwise — check the collision before you write the contradiction. And a negative
  claim is never established by a search returning nothing; it is established by reading the place it
  would have to be.
  - **PROGRESS IS NOT CLOSURE.** RULE: a task is CLOSED only against its own stated definition of
    done, read from the task record. A number that moved the right way is progress evidence, never
    closure evidence.
  - **A COUNT PROVES A STRING OCCURS, NOTHING MORE.** RULE: a grep may only LOCATE a candidate —
    before any count becomes a claim, OPEN the hits and read them in context, or ask the tool that
    OWNS the semantics.
  - **A MANIFEST IS A STRUCTURED DOCUMENT, NEVER A LINE RANGE.** RULE: before any verdict about a
    dependency, PARSE the manifest and name the SECTION the key lives in; the same package name in two
    sections answers two different questions.
  - **AN ACTOR IS IDENTIFIED BY A LOOKUP, NEVER BY WHAT ITS OUTPUT IS ABOUT.** RULE: identify an actor
    by identity evidence — id, live status, start time, its worktree contents — never by subject
    matter.
  - **DEDUPLICATION IS A VERDICT ABOUT IDENTITY.** RULE: a census over a class counts DECLARATIONS,
    never deduplicated names, and any identifier class includes `$`. A final figure matching
    expectation does not validate the path — if the intermediate was never checked, the method that
    produced it is still live and will produce the next number unexamined.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/audit-verdict-from-commit-subjects-not-from-reading.md`.

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

- **`promotion-to-contract-read-as-prevention`** — Promoting a lesson into a binding contract is not
  the same as preventing it, and treating the promotion as the end of the work is how a "closed"
  lesson keeps firing. **RULE: a promoted rule prevents only the FACES ITS TEXT NAMES, never the
  lesson in the abstract.** So on every recurrence of an ALREADY-promoted key, do not re-record it —
  READ the existing contract text, decide whether this incident is a face that text already names,
  and when it is not, EXTEND the text with the new face in every file that carries it before promoting
  again. A recurrence count climbing while the text stands unchanged means the text is the stale
  artifact.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/promotion-to-contract-read-as-prevention.md`.

- **`worker-claim-about-unreachable-file-committed-as-fact`** — A subagent's finding is UNVERIFIED BY
  ME no matter how well that subagent measured it, and relaying it to the owner without saying whose
  measurement it is turns their evidence into my assertion. **RULE: when passing a worker's finding to
  the owner, either verify it myself or name whose measurement it is IN THE SAME SENTENCE.** Without
  it, an inherited verdict is indistinguishable from one I established.
  - **A CLAIM ABOUT SOMEONE ELSE'S ARTEFACT, RELAYED AS AN ORDER.** RULE: never relay a claim about
    the CONTENT of an artefact as an instruction without reading that artefact at its CURRENT
    revision; where reading is not possible, name the revision the claim was made against.
  - **A PREDICTION RECORDED AS A FACT.** RULE: a prediction may never enter a durable record as fact —
    either run the thing and record the result, or write it as the author's expectation. On this
    machine, no claim that a directory removal will succeed is ever safe.
  - **A PLAN READ BACK AS A ROSTER.** RULE: a statement of what is running is assembled from receipts,
    never recited from the plan; if you cannot point at the receipt for an entry, it does not go on
    the list.
  - **"THE HOOK COVERS IT", RELAYED AS A CLOSURE.** RULE: whether a hook covers a tool is decided by
    exactly two things — the registration matcher, and a real-shaped payload driven through it with
    the expected verdict. A diff inside the hook's own code proves neither.
  - **A REFUSED ACTION REMEMBERED AS A DONE ONE.** RULE: after a refused tool call, the RETRY is the
    next action, before any reporting. A status line naming work as delegated or running is assembled
    from this turn's launch receipts, never from the brief you wrote.
  - **A WORKER'S OPEN QUESTION FORWARDED AS WORK FOR THE OWNER.** RULE: an item goes on the owner's
    work list only after an engram search for it and a read of the code in the same turn; otherwise it
    goes on the list marked as the worker's unverified claim.
  - **A WORKER'S PLAN RELAYED WITH ITS ENVIRONMENT PREMISES UNCHECKED.** RULE: before relaying a
    worker's activation, deploy or rollout plan, measure the environment premises it rests on (default
    branch, branches in use, roles and permissions, schedules) in the same turn, or mark them
    unverified.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/worker-claim-about-unreachable-file-committed-as-fact.md`.

- **`provisioning-bound-to-delegation-not-worktree-creation`** — A worktree you create YOURSELF
  arrives with no `node_modules`, because the provisioner is bound to DELEGATION (a `PreToolUse` hook
  on `Task|Agent`), never to worktree creation. **RULE: after any `git worktree add` you performed
  yourself, give the new worktree its dependencies BEFORE running a single gate there** — and never
  read a gate failure in a fresh worktree as a verdict about the code until `node_modules` is confirmed
  present. The first failure in a new worktree is almost always the missing install, and it will
  masquerade as anything: a type error, a broken import, a red gate unrelated to your change.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/provisioning-bound-to-delegation-not-worktree-creation.md`.

- **`gitignored-deliverable-destroyed-by-worktree-autoclean`** — CLOSED BY MECHANISM 2026-09-16. Two
  deliveries were lost because a worktree whose whole value sat in ignored paths read as EMPTY and was
  removed. ROOT: one `.gitignore` rule serves two opposite populations — `dist/`, `node_modules/` and
  coverage are build product and never a deliverable, while `.claude/**` is this project's own
  hand-authored tooling, always a deliverable and invisible to `git status --porcelain`.
  **THE RULE, a shared predicate rather than a habit:** the question a removal decides is "if this
  worktree were deleted right now, what would be gone for good?", answered in ONE place
  (`.claude/worktree-work/worktree-work.mjs`) that every consumer asks. **Anything ignored and
  UNDECLARED counts as work** — a path is exempt only where a declaration names the process that
  produces it. Proof: 29/29 selftest, 23/23 mutants killed. RESIDUAL GAP: the Stop gate fires only
  when a worker CLAIMS completion, so a worker that stops without claiming is still not blocked, and
  the harness's own auto-clean is untouched. Generalizes beyond worktrees: a predicate inherited by
  many consumers carries its blind spot to all of them — when a shared question keeps producing
  surprises, fix the question, never add a second answer beside it.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/gitignored-deliverable-destroyed-by-worktree-autoclean.md`.

- **`brief-contradicted-a-standing-project-rule`** — A brief I write outranks nothing: the project's
  standing rules do. Twice: I asked for API goldens in a SEPARATE commit (the rule says the same
  commit), and I told workers to make runtime messages "English output" when the owner's intent was
  bilingual everywhere, which made them delete the Spanish half of real messages. RULE: before fixing
  the FORM of a deliverable in a brief (commit shape, language, where it lands), check it against the
  project rules for that area; never extend a rule to a surface it does not name from a guess (apply
  its evident intent or ask); and never relay an unmeasured worker claim as the basis of a brief.
  Mechanism for the language face: the bilingual gate (every code text, runtime messages included).
- **`instructed-a-worker-to-run-a-denied-command`** — A brief is written from the operation I want,
  and the worker's environment decides what it can actually do. Twice: a brief told a worker to
  `git rebase` (denied in settings), and a brief told an `isolation: "worktree"` worker to create a
  new worktree and move into it, which made the worktree-isolation guard refuse every later shell
  call and left the worker without Bash for the rest of its session. RULE: before any command goes
  into a brief, check it against the worker's real environment (deny list, blocking hooks, its pinned
  worktree) and name the alternative that works. A worker never changes worktree: moving work onto a
  new base is the orchestrator's step (cherry-pick into the new worktree from the main checkout),
  followed by a worker whose TENANCY names that worktree from launch. THIRD FACE (2026-09-30): briefs
  told worktree workers to run `node .claude/diff-coverage/…` by a RELATIVE path; `.claude/` tooling is
  gitignored and lives only in the main checkout, so the worker could not self-verify. Every tooling
  command in a brief uses the main checkout's ABSOLUTE path. Mechanism: `~/.claude/brief-feasibility/`.
- **`integrated-a-range-without-running-its-cheap-gates`** — Every integration onto `develop` runs
  every gate that can READ the changed paths, never a gate list I chose. **A hand-picked gate set is a
  bounded search written down as coverage.** RULE: after a cherry-pick, run the gates derived from the
  change (`vitest related` plus every `check:*` whose inputs include a touched path), or all of
  `ci:lint` + `ci:checks` when that is cheap enough, and read their real exit codes before calling the
  integration done. Mechanism in build: `.claude/integrate/` plus a PreToolUse guard refusing a raw
  `git cherry-pick` on `develop`/`main`.
  - **THE GATE DEFERRED FOR A BUSY RESOURCE, and it was the only one that could see the defect.**
    RULE: a gate deferred because a resource is busy is a HARD BLOCKER on landing, written into the
    plan as one; a change to shipped styles or tokens runs `check:a11y` BEFORE anything is stacked on
    it; and no ref move onto `develop`/`main` happens without a complete green verdict of the full
    chain for that exact tree.
    By owner decision (2026-09-28) the landing guard is ADVISORY by default and blocks only when
    explicitly opted in (`B100_LANDING_GUARD=enforce`); landing verification is the related gates per
    change, plus `build:ci-pr` when the owner orders it. The hardest control sits at the point of no
    return: integrations onto `develop` run the full chain ADVISORY (develop is reversible and GitLab
    CI runs the full chain on it), but never below the unit-suite floor of the face below; every IRREVERSIBLE step — push/fast-forward of `main`, any release tag,
    `release:gitlab` — runs with `B100_LANDING_GUARD=enforce`, no exception.
  - **THE GENERATOR THAT READS THE CHANGE INDIRECTLY (2026-09-30).** A new card example landed
    after a 16-gate run I chose; `testing/goldens/content-projection-component.golden.ts` is
    generated from the real examples directory, so `check:goldens` and `golden.spec.ts` went red on
    develop and a worker found it three integrations later. RULE: every fast-forward of develop
    requires a green `npm test -- --all` on that exact tree, on top of the related `check:*` gates;
    a list I pick is never the landing proof. CLOSED BY MECHANISM (`integrated-a-range-without-running-its-cheap-gates`,
    fourth occurrence): the unit suite is a FLOOR the landing guard REFUSES in EVERY mode, overriding
    the advisory default above for that one requirement. A ref move onto `develop`/`main` is denied
    unless a complete, green, unmoved verdict of the tree's own `ci:test` expansion (derived from its
    `package.json`, never hardcoded) graded that exact tree, or one of the bookkeeping trees beneath
    it. Record it with `node .claude/gate-run/gate-run.mjs ci:test` in a clean worktree of the target
    commit. The full `build:ci-pr` chain stays advisory unless `B100_LANDING_GUARD=enforce`. Replayed
    on the real incident (develop `283d2c77` -> `cfe6a6ff`, real verdict store): DENY in both modes.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/integrated-a-range-without-running-its-cheap-gates.md`.
