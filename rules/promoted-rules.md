# Promoted rules — recurred despite the ledger, so they are binding

Fuente: sección «Promoted rules» de `~/.claude/CLAUDE.md`, condensada el 2026-09-28 por decisión del dueño.
Cada clave conserva su enunciado ENTERO, el título de cada cara y cada frase «RULE» LITERAL; el relato
medido de cada cara está completo en `~/.claude/lessons/evidence/<clave>.md` (no se carga solo: leerlo al tocar ese tema).

- **`stale-artifact-read-as-this-runs-result`** — Never interpret a results, exit-code, log, golden,
  or coverage artifact without first proving it belongs to THIS run: truncate or delete it in the same
  command that produces it, and REGENERATE whatever a gate derives from (`npm run build` before
  `check:api`, the full suite before coverage) before reading it. An artifact that outlives the run
  that made it is indistinguishable from this run's output, so a RED read off a stale artifact measures
  your execution order, not the tree. Recorded twice before it earned promotion — and then it RECURRED
  a third time WITH the rule already binding here, which is its own finding: this text did not stop it,
  so read the next paragraph as the part that has to do the work.
  **An ERROR, LIMIT, LOCK or QUOTA NOTICE is one of these artifacts too, and it is the one that slips through** … RULE: before asserting that
  something is still blocked, unavailable, rate-limited or locked, ATTEMPT IT — the attempt is nearly
  always cheaper than the claim — or say plainly that it is unverified. Never infer a CURRENT capability
  from a PAST refusal.
  **A PLAN IS AN ARTIFACT TOO, and it is the one that wastes other people's work.** … RULE: before dispatching work from any record older than the current session, verify the
  specific items are still open. And when a reconciliation is needed at all, it runs BEFORE the work it
  scopes — never beside it, because a verdict that arrives after the delegation cannot prevent it.
  **A BUILD RUN TO SATISFY ONE PRECONDITION CAN INVALIDATE ANOTHER** … RULE: before reading a SUITE, enumerate every artefact its gates derive from and regenerate ALL of
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
  **TWO LIVE PRODUCERS, ONE PATH — and every remedy above is powerless against it** … RULE: **an artefact is attributable to a run only when its PATH carries a run id.** A shared
  fixed-path log may never be read as one run's result — not its exit codes, not its tail, not its
  summary — however clean it looks. Before reading any run artefact, confirm the path is unique to that
  run; and before launching a long run, establish that no earlier one is still alive. The cheap probe
  is a process burning CPU since the log's creation minute; an EMPTY log proves nothing either way,
  because a buffered linter and a corpse look identical.
  **TWO LIVE PRODUCERS, ONE PORT — the same defect on a resource that is not a file** … RULE: before
  launching or resuming a worker while a long chain is live, name the exclusive resources both touch —
  Storybook's port, the demo server's port, the shared `node_modules`, the main checkout — and forbid the
  overlap in the brief. And a precondition refusal is never evidence about the code, nor is an
  attribution replayed under the same contention. The good half, again: the gate refused to grade
  rather than inventing a result, so the harm was an hour of chain, not a false verdict.
  **ONE RUN DIRECTORY, TWO POPULATIONS OF LOGS** … RULE: read a gate's result from the run's
  `verdict.json` (`gates[].log`), never by picking a file out of a directory by name.
  **NINTH FACE — THE READER RESOLVED A DIFFERENT CHECKOUT'S STATE** … RULE: a worker's verdict is read with `--read` run INSIDE that worker's
  worktree, or through the explicit path of its `runs/<id>/verdict.json`; never from the main checkout,
  and the report names the worktree the verdict came from.
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

- **`bounded-search-read-as-absence`** — Reading ONE empty store as "no record exists". Measured, twice, and the
  second time the owner had to correct me mid-task: asked how many backlog tasks remained, I
  answered that I had no reliable counter and reasoned from the harness task manager being empty —
  while a full 31-task backlog sat in engram, written BY me precisely because that manager has no
  durable store, and named by the owner in the same session as the source of truth.
  **A tool you lack is never the search that establishes absence.** Before saying a record does not
  exist, query every store that could hold it — and when the question is about project state,
  history, or what remains, query engram FIRST, because that is where this project deliberately
  puts what the tooling cannot keep. The failure is cheap to avoid and expensive to make: the owner
  plans from the answer.
  **SECOND FACE — A DOCUMENT IS NOT A SEARCH, and it launders someone else's miss into your MEASURED marker.** … RULE: a document asserting "X does not exist" is a HYPOTHESIS inheriting somebody else's search,
  never a measurement — and it may never be forwarded to a worker under `MEASURED:`. Search every
  place the thing could live, including outside the repository, before writing an absence down.
  **THIRD FACE — THE RULE NAMED THE STORE AND I STILL DID NOT OPEN IT, because a negative is written
  at a moment when nothing forces you to list what you searched.** Measured: in the backlog
  reconciliation (engram #632) I recorded task #26 as "NO empezada", citing "two searches in the
  artifact store return no `sdd/*` observation". Both searches were correct and both results were
  correct. The task's full definition of done — subject "10 · Design and build the premium
  verification harness", `blocks: ["25"]`, nine explicit requirements — sat the whole time in
  `~/.claude/tasks/<session-id>/26.json`, in BOTH session directories: the very store the SECOND FACE
  above names, by path and by file count, and whose 228 files I had personally verified earlier in
  that same session. So this is not a gap in what the contract says. Knowing the store exists does
  nothing at the instant a negative gets written, because a negative record carries no trace of its
  own coverage — "no observation found" and "no record exists anywhere" look identical on the page,
  and everyone downstream plans from the second reading.
  RULE: a negative written into any DURABLE record — an engram observation, a reconciliation, a
  README, a brief — must NAME THE STORES SEARCHED inside the record itself. That is the part that
  cannot be satisfied by remembering; it either appears in the text or it does not, and its absence
  tells the next reader the claim is unbounded. Where a store was not searched, say so rather than
  letting silence read as coverage.
  **FOURTH FACE — GIT'S LOCAL REF STORE IS A CACHE, NOT THE REPOSITORY** … RULE: **run `git fetch --all --tags` BEFORE asserting anything about tags, branches, or ahead/behind.**
  A local ref query is never evidence about origin. And note where this landed: under a `MEASURED:`
  marker, which is precisely the laundering the brief-provenance guard exists to stop — that guard can
  check the marker is PRESENT, it cannot check the claim is TRUE, so the honesty has to be mine.
  **FIFTH FACE — A BRIEF IS ASSEMBLED FROM THE TASK RECORD, NEVER AUTHORED FROM MY OWN SUMMARY** … RULE, operational: before writing any delegation brief,
  READ that task's own record in the harness task store. My summary of it is a lossy copy and outranks
  nothing; anything I would mark `HYPOTHESIS:` may already be MEASURED in the record, and shipping it
  as a guess spends a worker's whole run re-deriving what was known.
  **SIXTH FACE — A CAPABILITY DECLARED ABSENT FROM ONE TOOL'S SILENCE, and the store that held the answer was one I had already written code against.** … RULE: a tool returning nothing establishes only what THAT tool enumerates. Before declaring any
  capability, actor or record gone, name what the tool you used actually covers — and when the answer
  decides whether someone's work is thrown away, ATTEMPT the recovery instead of reasoning about it.
  CLOSED BY MECHANISM: `.claude/resume-before-fresh/guard.mjs` refuses a fresh delegation whose errand
  a recent agent already holds and prints the exact `SendMessage` call; 17/17 across its state space,
  plus a live probe against the real store.
  **SEVENTH FACE — THE RIGHT SEARCH OF THE WRONG SURFACE, and the tell is a noun that changes mid-sentence.** … RULE: **expanding ONE dependency graph establishes absence only within THAT graph.** Before saying
  anything does not gate a release, enumerate every gating surface the release actually passes
  through — the local script chain, the CI job list, and any branch protection — because a rigorous
  measurement of the wrong surface reads exactly like a finding about the right one, receipts and all.
  **The tell is grammatical and it is worth learning to hear:** I measured *"reachable from
  `build:ci-pr`"* and asserted *"blocks the release"*. The noun changed between the evidence and the
  claim, and nothing in the sentence marked them as different questions. Whenever the subject of your
  receipt is not literally the subject of your conclusion, the gap is where the error lives.
  **EIGHTH FACE — ONE MEMBER OF A CHAIN PARSED, THE WHOLE CHAIN ASSERTED, and the premise was borrowed from a task record** … RULE: **whether `build:ci-pr` (or any chain) reaches a script is a question with an owning tool —
  `check:ci-scripts` / `ci-build-completeness` — so ask it, never a hand parse of one member.** And a
  task record's premise is a HYPOTHESIS about the past: re-measure it against the whole surface before
  repeating it to the owner or putting it in a brief. This face is the seventh arriving through a
  document instead of a search: the record named `ci:checks`, so `ci:checks` is what I measured.
  **NINTH FACE — THE GLOB'S PATH SCOPE IS THE POPULATION, and nothing in the command says so** … RULE: **for any question about a POPULATION of files, derive the population from the tool's own
  config, never from a directory you assumed** — `.storybook/main.ts` for stories,
  `playwright/visual-stories.ts` for visual captures, `vitest`/`tsconfig` includes for specs. And a
  negative written into any durable record must NAME THE PATHS SEARCHED inside the record, so the next
  reader can see its bound; a negative whose scope is invisible reads as universal.
  Worth keeping, because the conclusion survived by luck rather than by method: the answer (zero
  baselines change) was still right, for a reason I had not measured — the two stories with `actions`
  are not in the capture list at all. **A right conclusion reached through a false premise leaves the
  false premise live**, and mine had already been written down as verified.
  **TENTH FACE — A PART PROBED, THE WHOLE DECLARED, AND THE THRESHOLD THAT CANNOT SAY "JUST STARTED"** … RULE: the progress of a multi-step run is read from its RUN DIRECTORY or its own `--read`/verdict
  reader, never from one step's log and never from a CPU cutoff. And before any threshold becomes a
  decision signal, name the state it must distinguish and check it can: a probe that answers the same
  for a healthy new process and a corpse is measuring age, not life.
  **ELEVENTH FACE — THE NOTIFICATION DESCRIBES THE REPORT, NOT THE BRANCH** … RULE: a worker's state is read from its branch head, dirty count and transcript mtime, measured in the
  same turn, never from the wording of a lifecycle notification. "No report yet" is not "no work yet".
  **DUODÉCIMA CARA — LA LISTA DE SKILLS DE UN TURNO ES UNA FOTO** (2026-09-29): dije al dueño que
  `/claude-api` no estaba disponible en su versión porque no figuraba en la lista de skills de ese
  turno; al instalar un plugin la lista se recargó y apareció. RULE: una lista de capacidades del
  harness solo prueba lo que hay EN ESE TURNO; decir «no aparece en esta sesión», nunca «no existe».
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/bounded-search-read-as-absence.md`.

- **`collision-fixed-by-deleting-unread-side`** — Resolving a conflict by taking one whole side preserves only what you
  thought to check afterwards. Measured, twice, and the second time it destroyed my own earlier
  work: I resolved three `docs/SCRIPTS.md` cherry-pick conflicts by keeping one side and
  re-substituting the machine-checkable cells from `package.json`, which silently dropped a
  hand-authored paragraph I had salvaged hours before — leaving the row self-contradicting (the
  Command column ran `--max-warnings=-1` while its own Description documented the spelling that
  aborts with `No -NUM option defined`) with `check:script-docs` green the whole time, because that
  gate compares commands and never reads prose.
  **The asymmetry: a side-taking resolution loses exactly the content no gate verifies**, which is
  also the content a human wrote deliberately and nobody will notice missing. So: before choosing a
  side, diff what each side uniquely HOLDS, not just what the gate will re-check. When both sides
  carry content, the resolution is a union you construct and verify, never a side you pick.
  **SECOND FACE — A STATE NAME IS NOT A DIAGNOSIS, and this one destroys work that was already right.** … RULE: act on what a finding SAYS, never on what its state name suggests. Whenever the remedy might
  be "record, adopt or accept what is already there", read what is there FIRST. Overwriting is not a
  neutral default — it is the one move that cannot be undone by re-running the tool.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/collision-fixed-by-deleting-unread-side.md`.

- **`audit-verdict-from-commit-subjects-not-from-reading`** — A SEARCH may only LOCATE candidates. The
  VERDICT comes from reading the construct in its context, or from the tool that owns the semantics —
  a parser, the linter, `--print-config`, the gate itself. This is the project's own "grep localiza,
  NO dictamina" raised to a binding rule because it recurred three times in one session, each time
  producing a confident statement that was false. (1) A reconciliation verdict — "17 of the 31 tasks
  are closed", one commit mapped to each — built from commit SUBJECT LINES with no diff opened; a
  subject states the author's INTENT, so it cannot distinguish a task closed from one merely worked on,
  and that verdict is what the owner uses to decide what remains. (2) `rg -c 'before_script'` returned
  16 against a worker's "zero"; the 16 were COMMENTS explaining why there is none, and the worker,
  who had parsed the YAML, was right. (3) `rg -c 'play\s*:'` returned 2 per story file and nearly had
  me report an audit's CRITICAL finding as false; every match was the substring inside `display: flex`,
  and reading showed 0 real play functions in exactly the 3 files of 91 that lack one.
  **The asymmetry that makes this binding: a search that MISSES is silent, and a search that COLLIDES
  looks like a hit.** Both read as evidence and neither is. So when a search result contradicts a claim
  someone reached by READING, the search is wrong until proven otherwise — check the collision before
  you write the contradiction. And a negative claim ("there is no X") is never established by a search
  returning nothing; it is established by reading the place X would have to be.
  **THIRD FACE — PROGRESS IS NOT CLOSURE, and this one reaches the owner as a plan.** … RULE: a task is CLOSED only against its own stated definition of done, read from the task record.
  A number that moved the right way is progress evidence, never closure evidence. A gate exiting 0 on
  a ratchet reports that the floor held — ask it what its target is before calling anything finished.
  **FOURTH FACE — A COUNT PROVES A STRING OCCURS, NOTHING MORE** … RULE: a grep may only LOCATE a candidate — before any count becomes a claim, OPEN the
  hits and read them in context, or ask the tool that OWNS the semantics: the compiler, the linter, the
  module loader. And this is worse inside a brief than inside a report, because a `MEASURED:` marker
  transfers your certainty to someone who cannot see how you arrived at it.
  **FIFTH FACE — A MANIFEST IS A STRUCTURED DOCUMENT, NEVER A LINE RANGE**, and this one nearly
  shipped a broken release. Measured 2026-09-09: I told the owner that task #56 — *how the two lint
  plugins reach a CONSUMER* — was still open, citing that `package.json` lines 295-296 still carry
  `git+http://` specifiers. The string was there; the grep was right. But those two lines are
  **devDependencies** … RULE: before any verdict about a dependency, PARSE the manifest and name the SECTION the key lives
  in. The same package name in two sections answers two different questions, and a task about the
  CONSUMER contract can never be settled by a devDependency line.
  **SIXTH FACE — AN ACTOR IS IDENTIFIED BY A LOOKUP, NEVER BY WHAT ITS OUTPUT IS ABOUT** … RULE: identify an actor by identity evidence — id, live status, start time, its worktree
  contents — never by subject matter. When two actors share a topic, the topic is not evidence about
  which one you are looking at. And an artifact the owner is SHOWING me outranks my recollection of
  who produced something similar; the cost of getting it wrong is that they act on my answer, and here
  the action they asked for was to kill it.
  **SEVENTH FACE — DEDUPLICATION IS A VERDICT ABOUT IDENTITY, and a right answer can hide a broken
  method** (`audit-verdict-from-commit-subjects-not-from-reading`). Measured 2026-09-09, twice in one
  task on the same symbol. A member census over a class extracted identifiers with a character class
  that omitted `$`, so `readonly displayedRows$: Observable<T[]>` truncated to `displayedRows` and
  collapsed onto the adjacent `readonly displayedRows: Signal<T[]>` under `sort -u`. It reported
  **179 declarations where there are 180** … RULE: a census over a class counts DECLARATIONS, never deduplicated names, and any identifier class
  includes `$`. And the general half: **a final figure matching expectation does not validate the path.**
  If the intermediate was never checked, the agreement may be coincidence, and the method that produced
  it is still live and will produce the next number unexamined.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/audit-verdict-from-commit-subjects-not-from-reading.md`.

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
  **SECOND FACE — A CLAIM ABOUT SOMEONE ELSE'S ARTEFACT, RELAYED AS AN ORDER** … RULE: never relay a claim about the CONTENT of an artefact as an instruction without reading that
  artefact at its CURRENT revision. Passing a finding along as a report is cheap and honest — the
  recipient can weigh it. Passing it as an order transfers your certainty and removes their judgement,
  so the verification burden RISES rather than falls. Where reading is not possible, name the revision
  the claim was made against and ask the recipient to check it, which is the whole difference between
  "make this edit" and "this was reported against rev 3, confirm before acting".
  **THIRD FACE — A PREDICTION RECORDED AS A FACT, and it is the least verifiable claim there is** … RULE: **a prediction may never enter a durable record as fact.** Either run the thing and record the
  result, or write it as the author's expectation using a word that says so. The tell is grammatical
  and easy to catch once named — a future tense, "will", "on the next run", "once it re-runs".
  And on THIS machine one prediction is never safe: **any claim that a directory removal will succeed.**
  Windows cannot unlink a file a process holds, and a wipe interrupted halfway leaves a tree that is
  neither the old one nor the new one — the same mechanism that destroyed the shared `node_modules`
  and got `npm ci` banned here. A removal is a prediction until it has been read back.
  **FOURTH FACE — A PLAN READ BACK AS A ROSTER, and no worker was involved at all** … RULE: **a statement of what is running is assembled from receipts, never recited from the plan.** The
  receipts are the launch/resume results in this session, or the harness store
  `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.meta.json` with transcript mtimes. If I
  cannot point at the receipt for an entry, it does not go on the list. And a status line that grows by
  one between two messages with no launch in between is the tell.
  **FIFTH FACE — "THE HOOK COVERS IT", RELAYED AS A CLOSURE** … RULE: **whether a hook covers a tool is decided by exactly two things, and a closure claim must
  show both.** First, the registration matcher that routes that tool to the hook. Second, a
  REAL-SHAPED payload for that tool, captured from the harness rather than typed from memory, going
  through the hook with the expected verdict. A diff inside the hook's own code proves neither. A
  self-test whose fixtures invent the payload shape proves only that the code handles the invented
  shape.
  **SIXTH FACE — A REFUSED ACTION REMEMBERED AS A DONE ONE, and it leaves a stronger false memory than a merely planned step** … RULE, two halves. **After a refused tool call, the RETRY is the next action** — before any
  reporting, any summary, any other task. An unblocked refusal that is not immediately re-issued is a
  dropped action wearing the costume of a completed one. And the fourth face binds unchanged: a status
  line naming work as delegated or running is assembled from THIS turn's launch receipts, never from
  the brief you wrote. If you cannot point at the receipt, the entry does not go on the list.
  **SEVENTH FACE — A WORKER'S OPEN QUESTION FORWARDED AS WORK FOR THE OWNER** … RULE: **an item goes on the owner's work list only after an engram search for it and a read of the
  code in the same turn.** Otherwise it goes on the list marked as the worker's unverified claim. A
  defect list is an instruction to spend work; every entry in it is an assertion.
  **EIGHTH FACE — A WORKER'S PLAN RELAYED WITH ITS ENVIRONMENT PREMISES UNCHECKED**
  (`worker-claim-about-unreachable-file-committed-as-fact`, ninth occurrence, 2026-09-28): I told the owner
  that Renovate «activates after the next develop → main merge», which was the worker's activation plan.
  The owner uses only develop, and the GitLab default branch was `main` in all three projects. RULE: before
  relaying a worker's activation, deploy or rollout plan, measure the environment premises it rests on
  (default branch, branches in use, roles and permissions, schedules) in the same turn, or mark them unverified.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/worker-claim-about-unreachable-file-committed-as-fact.md`.

- **`provisioning-bound-to-delegation-not-worktree-creation`** — A worktree you create YOURSELF
  arrives with no `node_modules`, because the provisioner is bound to DELEGATION (a `PreToolUse` hook
  on `Task|Agent`), never to worktree creation. **RULE: after any `git worktree add` you performed
  yourself, give the new worktree its dependencies BEFORE running a single gate there** — and never
  read a gate failure in a fresh worktree as a verdict about the code until `node_modules` is confirmed
  present. The first failure in a new worktree is almost always the missing install, and it will
  masquerade as anything: a type error, a broken import, a red gate unrelated to your change.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/provisioning-bound-to-delegation-not-worktree-creation.md`.

- **`gitignored-deliverable-destroyed-by-worktree-autoclean`** — CLOSED BY MECHANISM 2026-09-16; this
  entry states what the mechanism enforces. Two deliveries were lost because a worktree whose whole
  value sat in ignored paths read as EMPTY and was removed. ROOT, and it is one `.gitignore` rule
  serving two opposite populations: `dist/`, `node_modules/` and coverage are build product — never a
  deliverable, and counting them makes every consumer refuse forever — while `.claude/**` is this
  project's own hand-authored tooling, always a deliverable and invisible to `git status --porcelain`.
  `.claude/fleet-env/delivery.mjs:27` had written that blindness down as a deliberate decision.
  THE RULE, now a shared predicate rather than a habit: the question a removal decides is **"if this
  worktree were deleted right now, what would be gone for good?"**, and it is answered in ONE place
  (`.claude/worktree-work/worktree-work.mjs`) that every consumer asks — `fleet-env/delivery.mjs`,
  `integrate/worktree-closure.mjs`, `orphan-work-guard/guard.mjs`. **Anything ignored and UNDECLARED
  counts as work**: a path is exempt only where a declaration names the process that produces it, so a
  new ignored build directory shows up loudly and a new ignored tooling directory is protected for
  free. The two failure directions are not symmetric and the default points away from the silent one.
  Proof: 29/29 selftest on constructed repositories, 23/23 mutants killed against that green baseline,
  and eight consumer selftests re-run green. THE RESIDUAL GAP, stated rather than hidden: the Stop gate
  fires only when a worker CLAIMS completion, so a worker that stops without claiming is still not
  blocked, and the harness's own auto-clean is untouched.
  The half that generalises beyond worktrees: **a predicate inherited by many consumers carries its
  blind spot to all of them**, and the blind spot is invisible precisely because every consumer agrees.
  When a shared question keeps producing surprises, fix the question — never add a second answer beside
  it.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/gitignored-deliverable-destroyed-by-worktree-autoclean.md`.

- **`integrated-a-range-without-running-its-cheap-gates`** — Every integration onto `develop` runs every
  gate that can READ the changed paths, never a gate list I chose. Measured, four times: 4703f612 was
  picked with no gates (format:check red); 56f26512 got prettier and eslint only (32
  `ensure-demo-generated` specs red); fbe3f398 got its own specs plus `check:ci-scripts`
  (`check:i18n-provenance` red, because a `docs/SCRIPTS.md` description changed); 3d42c263 left
  `check:provenance-coverage` red. Each time my selection was plausible and each time it missed a gate
  that reads the touched files INDIRECTLY: a sidecar, a spec fixture, a derived policy. **A hand-picked
  gate set is a bounded search written down as coverage.**
  RULE: after a cherry-pick, run the gates derived from the change (`vitest related` plus every
  `check:*` whose inputs include a touched path), or all of `ci:lint` + `ci:checks` when that is cheap
  enough, and read their real exit codes before calling the integration done. Mechanism in build:
  `.claude/integrate/` (integration command) plus a PreToolUse guard refusing a raw `git cherry-pick`
  on `develop`/`main`; promotion closes only when that guard's selftest replays the four incidents.
  **SECOND FACE — THE GATE DEFERRED FOR A BUSY RESOURCE, and it was the only one that could see the defect** … RULE: a gate deferred because a resource is busy is a HARD BLOCKER on landing,
  written into the plan as one; a change to shipped styles or tokens runs `check:a11y` BEFORE anything
  is stacked on it; and no ref move onto `develop`/`main` — pick, merge or fast-forward — happens
  without a complete green verdict of the full chain for that exact tree.
  By owner decision (2026-09-28) the landing guard is ADVISORY by default and blocks only when explicitly
  opted in (`B100_LANDING_GUARD=enforce`); landing verification is the related gates per change, plus
  build:ci-pr when the owner orders it.
  WHERE ENFORCE APPLIES (owner decision 2026-09-28, "déjalo anotado así"): the hardest control sits at
  the point of no return. Integrations onto `develop` run ADVISORY: each change passes its related
  gates, measured, because develop is reversible and GitLab CI runs the full chain on it. Every
  IRREVERSIBLE step — push/fast-forward of `main`, any release tag (v1.0.0 included), `release:gitlab`
  — runs with `B100_LANDING_GUARD=enforce` in that shell, no exception, so it cannot move without a
  complete green `build:ci-pr` verdict on that exact tree.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/integrated-a-range-without-running-its-cheap-gates.md`.
