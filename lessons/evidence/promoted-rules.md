# Promoted rules — loaded text archived verbatim / reglas promovidas, texto cargado archivado literalmente

## Loaded text archived 2026-10-06 (tiered, B3)

The block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-06; it is archived byte for byte, and the loaded file keeps only its binding text. @es El bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-06; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
# Promoted rules — recurred despite the ledger, so they are binding

Fuente: sección «Promoted rules» de `~/.claude/CLAUDE.md`, condensada el 2026-09-28 por decisión del dueño.
Cada clave conserva su enunciado ENTERO, el título de cada cara y cada frase «RULE» LITERAL; el relato
medido de cada cara está completo en `~/.claude/lessons/evidence/<clave>.md` (no se carga solo: leerlo al tocar ese tema).

- **`stale-artifact-read-as-this-runs-result`** — Never interpret a results, exit-code, log, golden,
  or coverage artifact without first proving it belongs to THIS run: truncate or delete it in the same
  command that produces it, and REGENERATE whatever a gate derives from (`npm run build` before
  `check:api`, the full suite before coverage) before reading it. An artifact that outlives the run
  that made it is indistinguishable from this run's output, so a RED read off a stale artifact measures
  your execution order, not the tree.
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

- **`guard-that-cannot-go-red`** — A new guard, gate, check or classifier is NOT trusted until it has
  been proven to DISCRIMINATE, on real cases, across the state space its decision ranges over. Silence
  from a check is evidence ONLY once that same check has been seen to speak; testing that a mechanism
  FIRES is not testing that it DECIDES CORRECTLY. RULE: enumerate the state space the decision ranges
  over and exercise each state in the self-test, so the discrimination cannot silently drift back.
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

- **`bounded-search-read-as-absence`** — Reading ONE empty store as "no record exists". **A tool you
  lack is never the search that establishes absence.** Before saying a record does not exist, query
  every store that could hold it — and when the question is about project state, history, or what
  remains, query engram FIRST, because that is where this project deliberately puts what the tooling
  cannot keep.
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
    it. CLOSED BY MECHANISM: `~/.claude/resume-before-fresh/guard.mjs`.
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
    `bounded-search-read-as-absence`).**
    RULE: liveness is read from the actor's transcript mtime and last record, progress from `git log`
    of the repo, both in the same turn; a delivery-queued message proves nothing ran.
  - **LA LISTA DE SKILLS DE UN TURNO ES UNA FOTO.** RULE: una lista de capacidades del harness solo
    prueba lo que hay EN ESE TURNO; decir «no aparece en esta sesión», nunca «no existe».

- **`collision-fixed-by-deleting-unread-side`** — Resolving a conflict by taking one whole side
  preserves only what you thought to check afterwards. **The asymmetry: a side-taking resolution
  loses exactly the content no gate verifies**, which is also the content a human wrote deliberately
  and nobody will notice missing. RULE: before choosing a side, diff what each side uniquely HOLDS,
  not just what the gate will re-check; when both sides carry content, the resolution is a union you
  construct and verify, never a side you pick.
  - **A STATE NAME IS NOT A DIAGNOSIS.** RULE: act on what a finding SAYS, never on what its state
    name suggests. Whenever the remedy might be "record, adopt or accept what is already there", read
    what is there FIRST — overwriting is not a neutral default.

- **`audit-verdict-from-commit-subjects-not-from-reading`** — A SEARCH may only LOCATE candidates. The
  VERDICT comes from reading the construct in its context, or from the tool that owns the semantics —
  a parser, the linter, `--print-config`, the gate itself. **The asymmetry that makes this binding: a search that
  MISSES is silent, and a search that COLLIDES looks like a hit.** So when a search result contradicts a claim someone reached by READING, the search is wrong
  until proven otherwise — check the collision before you write the contradiction. And a negative
  claim is never established by a search returning nothing; it is established by reading the place it
  would have to be.
  - **PROGRESS IS NOT CLOSURE.** RULE: a task is CLOSED only against its own stated definition of
    done, read from the task record. A number that moved the right way is progress evidence, never
    closure evidence.
  - **A COUNT PROVES A STRING OCCURS, NOTHING MORE.** RULE: a grep may only LOCATE a candidate —
    before any count becomes a claim, OPEN the hits and read them in context, or ask the tool that
    OWNS the semantics.
  - **A FILE'S SHARE JUDGED FROM ITS LOUDEST TOKENS (2026-09-30,
    `audit-verdict-from-commit-subjects-not-from-reading`).**
    RULE: a claim about what share of a file or list belongs to a category is made only
    after classifying every entry by reading it, and the sentence carries the count (N of M).
  - **ENTRIES CALLED DUPLICATES FROM THEIR SHARED LABEL (2026-09-30,
    `audit-verdict-from-commit-subjects-not-from-reading`).**
    RULE: "duplicate" is a share claim too — compare every entry against its supposed copy
    before proposing to remove or unload the set, and state how many are fully covered (N of M).
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

- **`brief-marker-written-as-prose-not-literal-form`** — CLOSED BY MECHANISM 2026-09-09; this entry
  states the rule the mechanism enforces. A delegation brief must carry both provenance markers, and
  the check is: **the word `MEASURED` / `HYPOTHESIS` STARTS its own line, and that line carries a
  colon somewhere.** What sits between the word and the colon is yours — a qualifier, a parenthetical,
  a date, a sha. Both of these pass: `MEASURED: 70 of 70` and
  `- MEASURED (by me, on develop just now): 70 of 70`. Guard `~/.claude/brief-provenance/guard.mjs`.
  - **THE RESUME WRITTEN AS PROSE (2026-09-30).** RULE: every Agent prompt and every worker SendMessage is drafted FROM the skeleton —
    line 1 `MEASURED: …`, line 2 `HYPOTHESIS: …`, then the instruction — even a two-line resume; for
    a non-trivial brief run `node ~/.claude/brief-feasibility/preflight.mjs <draft>`, which runs every
    delegation guard in one pass, before sending.

- **`promotion-to-contract-read-as-prevention`** — Promoting a lesson into a binding contract is not
  the same as preventing it, and treating the promotion as the end of the work is how a "closed"
  lesson keeps firing. **RULE: a promoted rule prevents only the FACES ITS TEXT NAMES, never the
  lesson in the abstract.** So on every recurrence of an ALREADY-promoted key, do not re-record it —
  READ the existing contract text, decide whether this incident is a face that text already names,
  and when it is not, EXTEND the text with the new face in every file that carries it before promoting
  again. A recurrence count climbing while the text stands unchanged means the text is the stale
  artifact.

- **`worker-claim-about-unreachable-file-committed-as-fact`** — A subagent's finding is UNVERIFIED BY
  ME no matter how well that subagent measured it, and relaying it to the owner without saying whose
  measurement it is turns their evidence into my assertion. **RULE: when passing a worker's finding to
  the owner, either verify it myself or name whose measurement it is IN THE SAME SENTENCE.** Without
  it, an inherited verdict is indistinguishable from one I established.
  - **A CLAIM ABOUT SOMEONE ELSE'S ARTEFACT, RELAYED AS AN ORDER (`worker-claim-about-unreachable-file-committed-as-fact`).** RULE: never relay a claim about
    the CONTENT of an artefact as an instruction without reading that artefact at its CURRENT
    revision; where reading is not possible, name the revision the claim was made against.
  - **A PREDICTION RECORDED AS A FACT (`worker-claim-about-unreachable-file-committed-as-fact`).** RULE: a prediction may never enter a durable record as fact —
    either run the thing and record the result, or write it as the author's expectation. On this
    machine, no claim that a directory removal will succeed is ever safe.
  - **A PLAN READ BACK AS A ROSTER (`worker-claim-about-unreachable-file-committed-as-fact`).** RULE: a statement of what is running is assembled from receipts,
    never recited from the plan; if you cannot point at the receipt for an entry, it does not go on
    the list.
  - **"THE HOOK COVERS IT", RELAYED AS A CLOSURE (`worker-claim-about-unreachable-file-committed-as-fact`).** RULE: whether a hook covers a tool is decided by
    exactly two things — the registration matcher, and a real-shaped payload driven through it with
    the expected verdict. A diff inside the hook's own code proves neither.
  - **A REFUSED ACTION REMEMBERED AS A DONE ONE (`worker-claim-about-unreachable-file-committed-as-fact`).** RULE: after a refused tool call, the RETRY is the
    next action, before any reporting. A status line naming work as delegated or running is assembled
    from this turn's launch receipts, never from the brief you wrote.
  - **A WORKER'S OPEN QUESTION FORWARDED AS WORK FOR THE OWNER (`worker-claim-about-unreachable-file-committed-as-fact`).** RULE: an item goes on the owner's
    work list only after an engram search for it and a read of the code in the same turn; otherwise it
    goes on the list marked as the worker's unverified claim.
  - **A WORKER'S PLAN RELAYED WITH ITS ENVIRONMENT PREMISES UNCHECKED (`worker-claim-about-unreachable-file-committed-as-fact`).** RULE: before relaying a
    worker's activation, deploy or rollout plan, measure the environment premises it rests on (default
    branch, branches in use, roles and permissions, schedules) in the same turn, or mark them
    unverified.
  - **AN OLDER RECORD'S STATE CLAIM RELAYED WHILE A NEWER RECORD CONTRADICTED IT (2026-09-30,
    `worker-claim-about-unreachable-file-committed-as-fact`).**
    RULE: a state claim
    taken from any durable record (engram, backlog, report) is re-measured in the same turn before
    it reaches the owner, or goes out naming the record and its date in the same sentence; and
    before relaying it, check newer records on the same subject for a contradiction.
  - **A WORKER'S "DONE" ACCEPTED FROM THE LIFECYCLE FLAG (2026-10-04,
    `worker-claim-about-unreachable-file-committed-as-fact`).** An archive worker reported a spec
    converted and cited a wrong record id; the native status said "archived", so the change was reported
    done, and neither claim was true. RULE: before reporting a worker's write as done, read each
    artefact it claims to have changed, at its current revision, and check the claimed change is there;
    a status flag proves the process ran, never what it wrote.

- **`provisioning-bound-to-delegation-not-worktree-creation`** — A worktree you create YOURSELF
  arrives with no `node_modules`, because the provisioner is bound to DELEGATION (a `PreToolUse` hook
  on `Task|Agent`), never to worktree creation. **RULE: after any `git worktree add` you performed
  yourself, give the new worktree its dependencies BEFORE running a single gate there** — and never
  read a gate failure in a fresh worktree as a verdict about the code until `node_modules` is confirmed present.

- **`gitignored-deliverable-destroyed-by-worktree-autoclean`** — CLOSED BY MECHANISM 2026-09-16.
  **THE RULE, a shared predicate rather than a habit:** the question a removal decides is "if this
  worktree were deleted right now, what would be gone for good?", answered in ONE place
  (`.claude/worktree-work/worktree-work.mjs`) that every consumer asks. **Anything ignored and
  UNDECLARED counts as work** — a path is exempt only where a declaration names the process that
  produces it. RESIDUAL GAP: the Stop gate fires only
  when a worker CLAIMS completion, so a worker that stops without claiming is still not blocked, and
  the harness's own auto-clean is untouched. Generalizes beyond worktrees: a predicate inherited by
  many consumers carries its blind spot to all of them — when a shared question keeps producing
  surprises, fix the question, never add a second answer beside it.

- **`brief-contradicted-a-standing-project-rule`** — A brief I write outranks nothing: the project's
  standing rules do. RULE: before fixing
  the FORM of a deliverable in a brief (commit shape, language, where it lands), check it against the
  project rules for that area; never extend a rule to a surface it does not name from a guess (apply
  its evident intent or ask); and never relay an unmeasured worker claim as the basis of a brief.
  Mechanism for the language face: the bilingual gate (every code text, runtime messages included).
- **`instructed-a-worker-to-run-a-denied-command`** — A brief is written from the operation I want,
  and the worker's environment decides what it can actually do. RULE: before any command goes
  into a brief, check it against the worker's real environment (deny list, blocking hooks, its pinned
  worktree) and name the alternative that works. A worker never changes worktree: moving work onto a
  new base is the orchestrator's step (cherry-pick into the new worktree from the main checkout),
  followed by a worker whose TENANCY names that worktree from launch.
  Every tooling
  command in a brief uses the main checkout's ABSOLUTE path. Mechanism: `~/.claude/brief-feasibility/`.
  - **AN AUTHORISED OUTCOME WITH NO NAMED ROUTE (2026-10-02,
    `instructed-a-worker-to-run-a-denied-command`).** A brief authorised an outcome a deny rule guards
    (log in with a password kept in a file) and added a blanket "if denied, do not retry by another
    route"; a worker opened the file with a search tool, was refused, and abandoned its whole runtime
    pass. RULE: when a brief authorises an outcome that a deny rule guards, it names the exact working
    route and the refused ones, and a "do not retry another way" clause is scoped to the action it
    protects, never written as a blanket. This face is unmechanised: no guard can tell from prose
    whether a named route is the one that works; in its place, the shared brief section states it.
    @es Un brief autorizó un resultado protegido por una regla de denegación sin nombrar la vía que
    funciona, y añadió un «si te lo niegan, no reintentes por otra vía» general; un worker abrió el
    fichero con una herramienta de búsqueda, fue rechazado y abandonó toda su pasada de runtime.
    REGLA: el brief nombra la vía exacta que funciona y las rechazadas, y la cláusula de no reintentar
    se acota a la acción que protege. Cara sin mecanismo: ningún guard distingue en prosa si la vía
    nombrada es la buena; en su lugar, la sección compartida del brief la enuncia.
- **`shell-one-liner-corrupted-data`** — A text edit written as a shell one-liner (`sed`, `sd`, `awk`,
  `perl -e`, `python -c`…) passes through a shell that collapses doubled backslashes and eats a
  backslash before `"`, `$` or a backtick, so the pattern silently matches nothing, the program exits 0
  and the file is unchanged. Twice (2026-09-30, 2026-10-04); the first occurrence wrote the rule
  "the eval-guard must refuse it" but nobody built it, which is why it recurred. RULE: text edits with
  escapes, backslashes or template literals go through the Edit tool or a `.mjs` file, and after any
  scripted edit the expected marker is counted before anything relies on it. CLOSED BY MECHANISM
  (2026-10-04, claude-global-config 76c1241): `~/.claude/eval-guard/` refuses eaten escapes and broken
  quote shapes in the script arguments of sed, sd, awk, gawk, perl, ruby, python and python3 (kind
  `text-edit`), selftest 101/101, mutation campaign 23/23 killed, a real-shaped payload refused through
  the dispatcher. Heredoc bodies are data since 6258636 (the false positive on a body line that starts
  with a watched program is gone; the scan resumes after the terminator; `<<<` here-strings are
  inspected as arguments; selftest 122/122, mutants 30/30). Remaining gap, stated: the tokenizer is
  shared with the PowerShell tool, where `<<` has no heredoc meaning, so a `<<` in a PowerShell command
  would open a body — not measured.
  @es Una edición de texto escrita como one-liner de shell pasa por un shell que colapsa las barras
  invertidas dobles y se come la barra antes de `"`, `$` o el acento grave: el patrón no coincide con
  nada, el programa sale con 0 y el fichero queda igual. REGLA: esas ediciones van por la herramienta
  Edit o por un `.mjs`, y tras cualquier edición por script se cuenta el marcador esperado. Lo impide
  `~/.claude/eval-guard/` desde 76c1241; los cuerpos de heredoc son datos desde 6258636; hueco
  declarado: `<<` en comandos de PowerShell, sin medir.
- **`brief-had-workers-open-every-image`** — An image is the most expensive thing a worker can load,
  and every image it opens is re-sent on each of its later steps: the cost is images times remaining
  steps. Twice in one day (2026-10-02) a brief of mine made workers review a body of screenshots
  inside a long run: first one by one (an 18 MB transcript, the usage window gone in 51 minutes), then
  through contact sheets of six (6.5 MB in 20 minutes, one screen of six finished). RULE: a
  long-running worker gets an IMAGE BUDGET stated in its brief — at most 4 contact sheets per run, its
  own captures only, each first checked by a DOM assertion and the PNG size at capture time — and
  reviewing a body of existing images is a separate short-lived unit whose only job is that review.
  No mechanism is built yet; one is possible and designed: a delegation guard in the
  `pretooluse-delegation` manifest that refuses a brief mentioning screenshots without an
  `IMAGE BUDGET` line. Until it exists, the shared brief sections carry the rule and every launch
  prompt repeats it.
  @es Una imagen es lo más caro que un worker puede cargar, y cada imagen abierta se reenvía en cada
  paso posterior: el coste es imágenes por pasos restantes. Dos veces en un día un brief mío hizo que
  los workers revisaran capturas dentro de una corrida larga. REGLA: un worker de corrida larga recibe
  un PRESUPUESTO DE IMÁGENES en su brief (como máximo 4 hojas de contactos por corrida, solo sus
  propias capturas, comprobadas antes por una aserción del DOM y el tamaño del PNG), y revisar un
  conjunto de imágenes existentes es una unidad aparte, corta, dedicada solo a eso. Todavía no hay
  mecanismo; es posible y está diseñado: un guard de delegación que rechace un brief que mencione
  capturas sin una línea `IMAGE BUDGET`.
- **`integrated-a-range-without-running-its-cheap-gates`** — Every integration onto `develop` runs
  every gate that can READ the changed paths, never a gate list I chose. **A hand-picked gate set is a
  bounded search written down as coverage.** RULE: after a cherry-pick, run the gates derived from the
  change (`vitest related` plus every `check:*` whose inputs include a touched path), or all of
  `ci:lint` + `ci:checks` when that is cheap enough, and read their real exit codes before calling the
  integration done.
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
  - **THE GENERATOR THAT READS THE CHANGE INDIRECTLY (2026-09-30).** RULE: every fast-forward of develop
    requires a green `npm test -- --all` on that exact tree, on top of the related `check:*` gates;
    a list I pick is never the landing proof.
    CLOSED BY MECHANISM: the unit suite is a FLOOR the landing guard REFUSES in EVERY mode, overriding
    the advisory default above for that one requirement.
    Record it with `node .claude/gate-run/gate-run.mjs ci:test` in a clean worktree of the target
    commit. The full `build:ci-pr` chain stays advisory unless `B100_LANDING_GUARD=enforce`.
  - **THE UNIT SUITE NEVER TYPE-CHECKS A SPEC (2026-09-30,
    `integrated-a-range-without-running-its-cheap-gates`, fifth occurrence).**
    RULE: a move whose content changes any `*.spec.ts` is also graded by `check:spec-typecheck`.
    CLOSED BY MECHANISM: the landing guard's floor now has a second part, refused in EVERY mode. Record it with
    `node .claude/gate-run/gate-run.mjs check:spec-typecheck` in a clean worktree of the target commit.

- **`acted-on-a-live-actors-working-state`** — Acting on shared repository state — a worktree, an index —
  before establishing that no OTHER actor's work is mixed into it.
  - **A LIVE ACTOR'S WORKING TREE COMMITTED MID-RUN (2026-09-09).** RULE: before committing,
    reaping, rebasing or otherwise acting on ANY worktree that is not mine, establish that its actor has
    STOPPED from the agent list, never from how finished the diff looks.
  - **THE SHARED INDEX SWEPT INTO MY COMMIT (2026-09-30).** `git add <path>` only ADDS,
    it never NARROWS what a bare `commit` then sweeps up. RULE: commit with an explicit pathspec (`-- <paths>`, or `--only <paths>`) in
    ANY repo another actor may have touched, never a bare `commit` that sweeps the whole shared index.
    CLOSED BY MECHANISM: `~/.claude/commit-pathspec-guard/guard.mjs` (selftest and mutation-proof run,
    both green).

- **`worker-overwrote-master-backlog`** — A delegated subagent may never write, update, or delete the
  project's master backlog (a `topic_key`/observation ending `-master`), because the standing "every
  finding enters the backlog the same turn" mandate is written to bind the ORCHESTRATOR and lives in a
  rules file that loads into every subagent too.
  - **A SUBAGENT CITED THE OWNER-MANDATE SECTION AS ITS OWN AUTHORITY (2026-09-30).** RULE: the mandate now names its subject explicitly (the orchestrator only); a
    delegated agent puts its finding in its `SubagentHandback` report instead, and the orchestrator
    transcribes it into the backlog the same turn. CLOSED BY MECHANISM:
    `~/.claude/backlog-owner-guard/guard.mjs`.

- **`landing-gate-run-on-a-tree-that-cannot-fast-forward`** — A landing-proof gate run (the whole gate
  chain invoked with no arguments, or the unit-suite floor `ci:test`) must REFUSE before a single gate
  starts, and before any verdict is written as `running`, when its tree cannot fast-forward the
  integration branch it means to prove. RULE: before any landing-proof gate run starts, ask git directly —
  `git merge-base --is-ancestor <integration branch> HEAD` — never trust a base named in a brief or
  remembered from an earlier turn. Where no automated gate-run capability exists yet, an orchestrator or
  worker runs that exact `merge-base --is-ancestor` check by hand before starting any landing-proof run,
  and rebuilds with `git switch -c <new-branch> <integration branch>` + `git cherry-pick <base>..<old-ref>`
  when it fails — never `git rebase`, which is denied in every b100-am-ui shell. CLOSED BY MECHANISM
  (b100-am-ui only, so far — this is the first occurrence, promoted early because the mechanism was
  already built rather than waiting for a second incident):
  `.claude/gate-run/landing-precondition.mjs`

- **`isolation-guard-screens-edits-but-not-shell-writes`** — CLOSED BY MECHANISM 2026-09-30
  (b100-am-ui). A rule enforced on ONE write channel and absent on the other is not a rule. **POLICY, one rule:** an isolated
  worker writes ONLY inside its own worktree and its private scratch; main-checkout tooling is changed by
  a worker that is NOT isolated and whose brief carries a `TENANCY:` line naming it. RULE: before a brief
  authorises a write by absolute path, establish whether its worker is isolated; an isolated worker is
  never told to write the main checkout, and a policy about writes is decided over the write TARGETS of
  a call, never per tool, so every channel gets the same answer. Two faces of the lesson stay
  unmechanised and are stated: a brief's prose authorisation cannot be discriminated from its prohibition
  (the same measured class as `brief-tenancy`), and writes made by a child process or by `rm`/`mkdir`/
  `touch` are not lexed. Mechanism: `.claude/isolation-boundary/guard.mjs`.

- **`unverified-commit-published-by-another-sessions-sync`** — In a repository other live sessions
  sync, any commit on the shared branch is published within minutes, verified or not. RULE: work in
  progress goes on a branch in its own worktree with no upstream, and reaches the shared branch only
  through `node ~/.claude/worktree-landing/land.mjs --worktree <dir> --main <dir> --branch <shared>
  --remote <remote>` (verifies in the worktree, then fast-forwards, pushes and reads the remote tip back);
  never commit to, merge into or fast-forward the shared branch by hand. CLOSED BY MECHANISM:
  `~/.claude/worktree-landing/land.mjs`.

- **`orchestrator-cwd-change-leaked-to-workers`** — CLOSED BY MECHANISM 2026-09-30. A FOREGROUND
  shell call from the main session that changes the session shell's directory (`cd`, `pushd`,
  `Set-Location`…) moves the harness's "Primary working directory", and the harness announces that to
  every live worker as an "Environment update".
  RULE: the main session runs a command in another directory with (1) absolute paths or `git -C <dir>`,
  (2) a `( cd <dir> && … )` subshell, or (3) `run_in_background`. Mechanism:
  `~/.claude/cwd-change-guard/guard.mjs`.
  @es Una llamada de shell en PRIMER PLANO de la sesión principal que cambia el directorio de la shell
  (`cd`, `pushd`, `Set-Location`) mueve el «Primary working directory» del harness, y este lo anuncia a
  todos los workers vivos. Usar rutas absolutas o `git -C`, un subshell `( cd X && … )` o
  `run_in_background`. Lo impide `~/.claude/cwd-change-guard/guard.mjs`.

- **`backlog-rewritten-from-summary-lost-detail`** — CLOSED BY MECHANISM. A memory record is saved by
  EDITING its previous revision, never by re-summarising it: `mem_save` on an existing `topic_key` is a
  full upsert that REPLACES the content.
  - **EACH FULL REWRITE AUTHORED FROM A RUNNING SUMMARY (2026-09-30).** RULE: a revision is the previous one edited; a finding enters with its
    measured detail and keeps it until closed with evidence.
  - **AN APPEND THAT WAS AN UPSERT (2026-10-01).** RULE: read the current revision
    (`mem_get_observation`) and resend it WHOLE plus the addition; to retire an item on purpose, write a
    line with a closure word (`CLOSED`, `CERRADO`, `SUPERSEDED`, `SUPERSEDIDO`) AND the item's first 6
    words verbatim. CLOSED BY MECHANISM: `~/.claude/backlog-content-guard/guard.mjs`, a `PreToolUse` guard
    on `mem_save`/`mem_update` (both engram mounts, every caller) that compares logical items of the
    current revision with the new content and denies a write that drops meaningful items; reorder,
    reflow and additions are allowed.
  - **AN IN-PLACE EDIT IS A DROP (2026-10-01, `backlog-rewritten-from-summary-lost-detail`).** Resending
    the whole record while rewording an item, or inserting a line INSIDE a paragraph (contiguous unmarked
    lines are ONE item), reads as that item deleted. RULE: an existing item is resent byte-identical; new
    facts go in their own paragraph or bullet; changing an item means a closure line for the old one plus
    the new one. The guard refused all three such writes, so the mechanism held; this face names the shape.
  - **A RECORD AT ENGRAM'S 50,000-BYTE CAP CANNOT GROW (2026-10-04, master backlog at 49,253 bytes).**
    Retiring old items by closure lines makes the record bigger, so shrinking needs an ARCHIVE. RULE:
    (1) `mem_save` the old sections VERBATIM into a new record in the same project whose `topic_key` is the
    target's `topic_key` + `-archive` + a suffix (`backlog/1.0.0-master-archive-1`); (2) read the archive
    back (`mem_get_observation`) to get its id; (3) resend the target WITHOUT those sections, plus one line
    `ARCHIVED: #<archive id>` (several ids per line, comma-separated). The guard accepts a dropped item only
    when its normalised text is verbatim in a cited archive; an unreadable, soft-deleted, other-topic or
    other-project archive refuses (fail CLOSED), and an item missing from the archive is named. Archives are
    guarded like any record (they cannot lose content later). The orchestrator writes both records; a
    worker never touches a master. Mechanism: `~/.claude/backlog-content-guard/archive.mjs`.
  @es Un registro de memoria se guarda EDITANDO su revisión anterior, nunca re-resumiéndola: `mem_save`
  sobre un `topic_key` existente es un upsert completo que REEMPLAZA el contenido. Dos caras: cada
  reescritura completa hecha desde un resumen (2026-09-30) y un «añadido» que era un upsert
  (2026-10-01, observación #1092). REGLA: leer la revisión actual y reenviarla ENTERA más lo nuevo; para
  retirar un item a propósito, una línea con palabra de cierre (`CLOSED`, `CERRADO`, `SUPERSEDED`,
  `SUPERSEDIDO`) Y las 6 primeras palabras del item literales. Lo impide
  `~/.claude/backlog-content-guard/guard.mjs` (cierra CERRADO para `backlog/*-master` si no puede leer
  el almacén; ABIERTO para registros ordinarios). REGISTRO EN EL TOPE DE 50.000 BYTES (2026-10-04): para
  encoger sin perder detalle, (1) `mem_save` de las secciones viejas LITERALES en un registro nuevo del mismo
  proyecto con `topic_key` = el del destino + `-archive` + sufijo; (2) leer su id; (3) reenviar el destino SIN
  esas secciones más una línea `ARCHIVED: #<id>` por archivo. La guardia acepta un item eliminado solo si su
  texto normalizado está literal en un archivo citado; un archivo ilegible, borrado, de otro `topic_key` o de
  otro proyecto rechaza (CERRADO) y un item ausente del archivo se nombra. Lo escribe el orquestador.

- **`contract-doc-names-a-mechanism-nobody-verifies`** — A path, script name, hook or wiring quoted from a
  memory or contract document is a HYPOTHESIS until the filesystem confirms it; confirm it before quoting
  it to a worker or to the owner, and fix the document in the same turn when it moved. CLOSED BY MECHANISM:
  `~/.claude/contract-path-check/check.mjs` reads every `~/.claude/…` path the contract files name, and its
  selftest runs on every landing. SCOPE, stated: project-relative `.claude/…` spellings and wiring
  CLAIMS (that a hook calls a script) are not checked, only that the named path exists.
  @es Una ruta, script, hook o cableado citado de un documento de contrato es una HIPÓTESIS hasta que el
  sistema de ficheros la confirma. Lo comprueba `~/.claude/contract-path-check/check.mjs` en cada aterrizaje.

- **`delegated-role-toolset-narrower-than-its-contract`** — Before delegating to a named role, check that
  its declared toolset can satisfy its task: a role asked to MEASURE or VERIFY needs execution (Bash).
  When it cannot, fix the role definition, never work around it in the brief. CLOSED BY MECHANISM:
  `~/.claude/agent-toolset-check/check.mjs` classifies every `agents/*.md` role (needs execution, or exempt
  with a written reason; an unclassified role is a finding) and its selftest runs on every landing, so a
  `gentle-ai sync` that strips Bash turns the next landing red.
  @es Antes de delegar a un rol, comprobar que su conjunto de herramientas puede cumplir su tarea: medir o
  verificar exige ejecución (Bash). Lo comprueba `~/.claude/agent-toolset-check/check.mjs` en cada aterrizaje.

- **`blamed-the-tool-for-a-defect-i-built-into-the-command`** — When a tool appears to misbehave,
  reproduce the behaviour on a MINIMAL input you fully control first; a defect you cannot reproduce
  minimally is a hypothesis about your own usage, and an unreproduced tool defect is never written into a
  brief. The command shape behind the incident (a command that ENDS by echoing `$?`) is refused by
  `~/.claude/exit-code-guard/guard.mjs`; the minimal-reproduction half is a written rule only, because no
  hook can judge whether a prose claim about a tool is true.
  @es Ante un comportamiento raro de una herramienta, reproducirlo primero con una entrada mínima propia;
  un defecto sin reproducir es una hipótesis sobre el uso propio y nunca va a un brief. La forma del
  comando (terminar con `echo $?`) la rechaza `~/.claude/exit-code-guard/guard.mjs`.

- **`replied-to-owner-in-english`** — Every line the owner can see is addressed to the owner, including
  the one-line narration written between tool calls; twice in one session (2026-10-01) that narration
  went out in English because it was written in the language of the tool work. RULE: every visible
  line, interstitial narration included, is written in Rioplatense Spanish with the Gentleman tone;
  English appears only quoted, in a code block, or as a technical term. No mechanism can prevent it,
  because no hook sees assistant text before it is shown; in its place, `~/.claude/owner-language-guard/guard.mjs`
  (a `Stop` guard) refuses the turn and forces a full Spanish rewrite in the same turn.
  @es Toda línea visible para el dueño va dirigida al dueño, también la narración de una línea entre
  llamadas a herramientas. REGLA: todo texto visible, narración incluida, va en español rioplatense con
  tono Gentleman; el inglés solo aparece citado, en bloque de código o como término técnico. Ningún hook
  ve el texto antes de mostrarse; en su lugar, `~/.claude/owner-language-guard/guard.mjs` (guard `Stop`)
  rechaza el turno y obliga a reescribirlo entero en español en el mismo turno.

- **`root-cause-stated-before-measured`** — A cause or defect inferred by READING (a code path, a log, a
  mutant's behaviour) was stated as fact, and both times the reproduction refuted it. The shared root:
  an inference was written down without the run that would have checked it, so nothing separated it
  from a measurement. RULE: a claim about what code DOES — a root cause, a defect, a hang, a crash — is
  stated as fact only after the behaviour is reproduced on constructed state in the same turn; until
  then it is written as a hypothesis in the same sentence, to the owner and to a worker alike.
  - **A CAUSE RELAYED TO THE OWNER FROM A READ CODE PATH (2026-10-01).** The owner was told a resolver
    treated the home as a project, from reading the code that writes the section; the worker measured
    the opposite on constructed and real homes.
  - **A MUTANT'S HANG WRITTEN INTO A BRIEF AS A PRODUCT DEFECT (2026-10-04).** A worker reported that
    one mutant of `hook-state/jsonl-tail.mjs` never ended; the orchestrator's resume brief stated, as a
    fact outside any `MEASURED:`/`HYPOTHESIS:` line, that the product code could loop forever on a
    truncated file. The worker showed the unmutated reader already stops on a 0-byte read. RULE, this
    face: a mutant's behaviour is evidence about the mutant only; a brief's free prose carries no claim
    about product behaviour — such a claim goes on a `MEASURED:` line with the command that reproduced
    it, or on a `HYPOTHESIS:` line.
  No mechanism closes it: whether a prose sentence asserts a behaviour, and whether that behaviour was
  reproduced, cannot be decided from the text (the same measured class as `brief-tenancy`). In its
  place: the brief skeleton (`MEASURED:` lines carry their command, everything else is `HYPOTHESIS:`),
  and a candidate brief-lint rule that flags behaviour claims outside marker lines, to be built only if
  task 2.7b proves it discriminates on real briefs.
  @es Una causa o un defecto deducido LEYENDO (una ruta de código, un log, el comportamiento de un
  mutante) se afirmó como hecho, y las dos veces la reproducción lo refutó. REGLA: una afirmación sobre
  lo que HACE el código —causa raíz, defecto, cuelgue, crash— se da como hecho solo tras reproducir el
  comportamiento sobre estado construido en el mismo turno; si no, se escribe como hipótesis en la misma
  frase, al dueño y a un worker por igual. Cara 2026-10-04: el cuelgue de un mutante se escribió en un
  brief como defecto del producto; el comportamiento de un mutante solo prueba algo sobre el mutante, y
  la prosa libre de un brief no lleva afirmaciones de comportamiento (van en `MEASURED:` con su comando,
  o en `HYPOTHESIS:`). Sin mecanismo: el texto no permite decidir si una frase afirma un comportamiento
  ni si se reprodujo; en su lugar, el esqueleto del brief y una regla candidata de brief-lint que solo
  se construye si la tarea 2.7b prueba que discrimina sobre briefs reales.

- **`brief-measured-line-carried-an-unmeasured-claim`** — A `MEASURED:` line carries only what a command
  in THIS turn measured. Two occurrences:
  - 2026-10-04: a location was inferred from a name and placed under `MEASURED:`.
  - 2026-10-05: a plugin brief stated under `MEASURED:` that `plugin-eslint/node_modules` is a junction
    into b100's tree. The claim was copied from a 2026-09-21 contract note; `Get-Item` showed an empty
    `LinkType`, and the worker refuted it.
  RULE: before a durable record's state claim (contract, memory, backlog) goes into a brief, re-measure
  it in the same turn and write the command beside it. Otherwise it goes under `HYPOTHESIS:` with the
  record and its date. No mechanism is possible: a hook sees the text of the brief, never whether its
  author ran the command this turn. In its place, the brief skeleton and this rule stand.
  @es Una línea `MEASURED:` lleva solo lo que midió un comando en ESTE turno. Una afirmación de estado
  copiada de un registro duradero (contrato, memoria, backlog) se vuelve a medir en el mismo turno, con
  el comando al lado, o va bajo `HYPOTHESIS:` con el registro y su fecha. Sin mecanismo posible: un
  hook ve el texto del brief, nunca si su autor corrió el comando en este turno.
````
