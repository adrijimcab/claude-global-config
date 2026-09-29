# `bounded-search-read-as-absence` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

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
  **SECOND FACE — A DOCUMENT IS NOT A SEARCH, and it launders someone else's miss into your
  MEASURED marker.** Measured: I told the owner twice that the harness task manager has no durable
  store, and wrote it into a delegation brief under `MEASURED:`. I had listed ONE directory, found a
  README asserting that absence, and concluded nothing existed anywhere. The harness writes one JSON
  per task, carrying the full brief, to `~/.claude/tasks/<session-id>/<taskId>.json` — **228 files,
  IDs #17-#131** — and the README's own evidence had been a glob run under the wrong session
  directory. A silent miss, written down once, then inherited by everyone who read it.
  RULE: a document asserting "X does not exist" is a HYPOTHESIS inheriting somebody else's search,
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
  **FOURTH FACE — GIT'S LOCAL REF STORE IS A CACHE, NOT THE REPOSITORY**, and this one hides inside a
  command that looks authoritative. Measured: a brief asserted, under `MEASURED:`, that one plugin repo
  had "NO local tags at all (`git tag -l` empty)" and that another was "2 commits BEHIND
  `origin/develop`". The worker ran `git fetch --all --tags` and BOTH were false — the tag exists on
  origin at `fe35dc3`, and the second repo was 2 commits **AHEAD**, not behind. An empty `git tag -l`
  establishes only that THIS CHECKOUT has not fetched the tag; an ahead/behind count against a stale
  `origin/<branch>` ref measures the last fetch, not the remote. Both are bounded searches of ONE store
  — the local `.git` — reported as facts about the remote.
  RULE: **run `git fetch --all --tags` BEFORE asserting anything about tags, branches, or ahead/behind.**
  A local ref query is never evidence about origin. And note where this landed: under a `MEASURED:`
  marker, which is precisely the laundering the brief-provenance guard exists to stop — that guard can
  check the marker is PRESENT, it cannot check the claim is TRUE, so the honesty has to be mine.
  **FIFTH FACE — A BRIEF IS ASSEMBLED FROM THE TASK RECORD, NEVER AUTHORED FROM MY OWN SUMMARY**, and
  this face fired with the store already named by path AND file count in the paragraph above. Measured
  2026-09-09: I wrote five delegation briefs out of my own session summary and never opened the task
  store. Six task records existed in the previous 48 hours, and FOUR were exactly the four work tasks
  I dispatched — each carrying a better brief than the one I wrote. I handed a worker, as an
  unverified HYPOTHESIS to go test, the glob figures 91 files / 489 stories against a real 103 / 530,
  when the record already had them MEASURED, plus the root-cause shape (derive the population from
  `.storybook/main.ts`'s own indexing) and the trap (do NOT widen the glob without resolving the 41
  newly-enumerated stories). Same for the coverage caps `-463/-829/-84/-190`, the `wsl -e docker info`
  probe, and the plugins-contract contradiction. The owner caught it, twice, before any control did.
  Why naming the store was not enough: **writing a brief FEELS like authoring, not like querying**, so
  nothing in the act prompts a lookup — and a session summary is a DOCUMENT, which the second face
  above already forbids treating as a search. RULE, operational: before writing any delegation brief,
  READ that task's own record in the harness task store. My summary of it is a lossy copy and outranks
  nothing; anything I would mark `HYPOTHESIS:` may already be MEASURED in the record, and shipping it
  as a guess spends a worker's whole run re-deriving what was known.
  **SIXTH FACE — A CAPABILITY DECLARED ABSENT FROM ONE TOOL'S SILENCE, and the store that held the
  answer was one I had already written code against.** Five agents died together on a session rate
  limit. The owner said «relanza los agentes». I ran `ListAgents`, read back "No reachable agents — no
  other Claude session is running on this machine", and told the owner they were unrecoverable and
  that relaunching meant dispatching fresh ones. The owner refused it — «es imposible que no estén» —
  and was right. `ListAgents` enumerates SESSIONS and live peers; it does not enumerate this session's
  own STOPPED subagents. The harness writes one record per agent under
  `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.meta.json`, and addressing each by its RAW
  `agentId` — the file name minus its `agent-` prefix — resumed it from its own transcript on the
  first try, FIVE OUT OF FIVE. Sending to the human-readable NAME fails for all five; only the id works.
  What makes this the worst face so far: `.claude/agent-liveness/liveness.mjs` walks those very
  records — 431 of them, every one carrying a `description` — and I had written that module myself,
  for exactly this store. Knowing a store exists, and having built against it, does nothing at the
  instant a negative gets written from a DIFFERENT tool's silence.
  RULE: a tool returning nothing establishes only what THAT tool enumerates. Before declaring any
  capability, actor or record gone, name what the tool you used actually covers — and when the answer
  decides whether someone's work is thrown away, ATTEMPT the recovery instead of reasoning about it.
  CLOSED BY MECHANISM: `.claude/resume-before-fresh/guard.mjs` refuses a fresh delegation whose errand
  a recent agent already holds and prints the exact `SendMessage` call; 17/17 across its state space,
  plus a live probe against the real store.

  **SEVENTH FACE — THE RIGHT SEARCH OF THE WRONG SURFACE, and the tell is a noun that changes
  mid-sentence.** The faces above are searches that were too narrow or never run. This one is
  rigorous, correct, and about something else. Measured 2026-09-10: I told the owner the 96 missing
  visual baselines do NOT block the release. My evidence was real — I expanded the `build:ci-pr` npm
  script chain and found **14 reachable scripts, zero of them visual**, and stated the receipt. A
  worker refuted it and I verified the refutation myself: **`.gitlab-ci.yml:970` defines a `visual:`
  job on `merge_request_event` OR `develop`, with NO `allow_failure`**, running
  `npm run visual:check:nobuild`, and its own comment says a changed snapshot blocks the merge. The
  release is gated by CI, not by `build:ci-pr`, and I never opened the job list.
  RULE: **expanding ONE dependency graph establishes absence only within THAT graph.** Before saying
  anything does not gate a release, enumerate every gating surface the release actually passes
  through — the local script chain, the CI job list, and any branch protection — because a rigorous
  measurement of the wrong surface reads exactly like a finding about the right one, receipts and all.
  **The tell is grammatical and it is worth learning to hear:** I measured *"reachable from
  `build:ci-pr`"* and asserted *"blocks the release"*. The noun changed between the evidence and the
  claim, and nothing in the sentence marked them as different questions. Whenever the subject of your
  receipt is not literally the subject of your conclusion, the gap is where the error lives.

  **EIGHTH FACE — ONE MEMBER OF A CHAIN PARSED, THE WHOLE CHAIN ASSERTED, and the premise was borrowed
  from a task record** (`bounded-search-read-as-absence`). Measured 2026-09-13: I told the owner task
  #25 was still open because `check:i18n` is absent from `ci:checks`, and dispatched a worker on it. The
  worker refuted it in four minutes: `check:i18n` sits in `ci:lint` (since `1bacc100`), which is ALSO a
  step of `build:ci-pr`; pre-commit and pre-push run it too; and `check:ci-scripts`
  (`scripts/utils/ci-build-completeness/`) already reconciles CI against `build:ci-pr` in both
  directions — proved by removing the line and watching it exit 1. My parse of `ci:checks` was correct;
  `ci:checks` is one of seven steps. And the framing came straight from the task record's own text,
  which was stale — task #65 had already closed it.
  RULE: **whether `build:ci-pr` (or any chain) reaches a script is a question with an owning tool —
  `check:ci-scripts` / `ci-build-completeness` — so ask it, never a hand parse of one member.** And a
  task record's premise is a HYPOTHESIS about the past: re-measure it against the whole surface before
  repeating it to the owner or putting it in a brief. This face is the seventh arriving through a
  document instead of a search: the record named `ci:checks`, so `ci:checks` is what I measured.

  **NINTH FACE — THE GLOB'S PATH SCOPE IS THE POPULATION, and nothing in the command says so**
  (`bounded-search-read-as-absence`, tenth occurrence). Measured 2026-09-16: to check whether a table
  fix moved any visual baseline, I ran `grep -rln "b100-table" --include='*.stories.ts' src`, found the
  token `actions` in none of it, and wrote into the durable store, under *"verificado por mí"*, that
  the token appears in NO story. The stories of this repository are not under `src`: they are in
  `.storybook/stories/`, where `b100-table.stories.ts` exports 21 of them and TWO declare `actions`
  (`WithActions:230`, `WithActionsDefaultLabels:253`). The worker refuted me and I confirmed it.
  What makes this the worst instance yet: **the FIFTH face of this very key already recorded the exact
  operational rule for this exact population** — derive the story set from `.storybook/main.ts`'s own
  indexing, with the measured cost of not doing so (91 files / 489 stories asserted against a real
  103 / 530). The rule was there, in this file, naming the tool and the file, and I globbed a directory
  anyway. `--include` looks like the filter that defines the set; the PATH argument beside it is what
  actually defines it, and it is the one nobody reads twice.
  RULE: **for any question about a POPULATION of files, derive the population from the tool's own
  config, never from a directory you assumed** — `.storybook/main.ts` for stories,
  `playwright/visual-stories.ts` for visual captures, `vitest`/`tsconfig` includes for specs. And a
  negative written into any durable record must NAME THE PATHS SEARCHED inside the record, so the next
  reader can see its bound; a negative whose scope is invisible reads as universal.
  Worth keeping, because the conclusion survived by luck rather than by method: the answer (zero
  baselines change) was still right, for a reason I had not measured — the two stories with `actions`
  are not in the capture list at all. **A right conclusion reached through a false premise leaves the
  false premise live**, and mine had already been written down as verified.

  **TENTH FACE — A PART PROBED, THE WHOLE DECLARED, AND THE THRESHOLD THAT CANNOT SAY "JUST STARTED"**
  (`bounded-search-read-as-absence`, eleventh occurrence). Measured 2026-09-16: I announced that a live
  integration was dead. Evidence: the mtime of ONE log — `005-lint.log`, of twenty — had not moved, and
  a process list filtered at `CPU > 200s` came back empty. Both readings were true and both were about
  nothing. The run was at **gate 20 of the chain**, healthy; the process I had filtered out was the gate
  that had just started, holding 17 seconds of CPU. One listing of the run directory — the tool that
  OWNS "how far has this run got" — showed twenty logs, newest first, and answered it instantly.
  Two distinct defects, and the second is the reusable one. First: I probed a PART and concluded about
  the WHOLE. Second: **an arbitrary threshold is not a liveness probe when it cannot distinguish
  "just started" from "dead"** — 17 seconds and 0 seconds sit on the same side of every cutoff I could
  have picked, so that filter had no NO to give about youth, only about age.
  RULE: the progress of a multi-step run is read from its RUN DIRECTORY or its own `--read`/verdict
  reader, never from one step's log and never from a CPU cutoff. And before any threshold becomes a
  decision signal, name the state it must distinguish and check it can: a probe that answers the same
  for a healthy new process and a corpse is measuring age, not life.

  **ELEVENTH FACE — THE NOTIFICATION DESCRIBES THE REPORT, NOT THE BRANCH**
  (`bounded-search-read-as-absence`, twelfth occurrence). Measured 2026-09-22, three times in one
  session: an interim worker notification said "has not reported yet: waiting on its own background
  work", and I relayed it to the owner as "nothing new, no SHA to judge". Twice the branch already held
  a new commit (47759975; then 47e29eee and b8f100d5). The claim guard stopped all three turns. The
  notification is true about the REPORT and silent about the BRANCH, and I read one as the other.
  RULE: a worker's state is read from its branch head, dirty count and transcript mtime, measured in the
  same turn, never from the wording of a lifecycle notification. "No report yet" is not "no work yet".
  **DUODÉCIMA CARA — LA LISTA DE SKILLS DE UN TURNO ES UNA FOTO** (2026-09-29, apéndice tras la
  auditoría prompt-audit, antes de condensar el resumen en `promoted-rules.md`): dije al dueño que
  `/claude-api` no estaba disponible en su versión porque no figuraba en la lista de skills de ese
  turno; al instalar un plugin la lista se recargó y apareció. RULE: una lista de capacidades del
  harness solo prueba lo que hay EN ESE TURNO; decir «no aparece en esta sesión», nunca «no existe».

