# `audit-verdict-from-commit-subjects-not-from-reading` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

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
  **THIRD FACE — PROGRESS IS NOT CLOSURE, and this one reaches the owner as a plan.** The two above
  are about reaching a verdict from a proxy. This is reaching it from a REAL measurement that answers
  a different question. Measured: I reported a task as closed citing my own true number, an
  undocumented-API ratchet driven from 243 to 3 — while the task's stated definition of done was 392
  to ZERO, and the gate's own output said `Baseline: 3 … Target: 0`. The ratchet was green because a
  FLOOR HELD, which is not the target being reached, and I never opened the task record to compare.
  RULE: a task is CLOSED only against its own stated definition of done, read from the task record.
  A number that moved the right way is progress evidence, never closure evidence. A gate exiting 0 on
  a ratchet reports that the floor held — ask it what its target is before calling anything finished.
  **FOURTH FACE — A COUNT PROVES A STRING OCCURS, NOTHING MORE**, and this is the face that reaches a
  worker as an order. Measured: one brief carried TWO false claims under `MEASURED:`, both from reading
  a `grep -c` as a verdict, and both would have broken the build had the worker obeyed instead of
  measuring. (1) "`provideZonelessChangeDetection` IS in `@angular/core@19.2.25`" — because `grep -c`
  returned 1 in `index.d.ts`. The worker OPENED that hit: line 582, inside a **JSDoc comment**, not a
  declaration. The ESM loader answers "does not provide an export named" and `tsc` gives **TS2724**; the
  symbol landed in Angular 20. (2) "exactly 4 components carry a redundant `standalone: true`" — measured
  over the glob `src/lib/**/*.component.ts`. All four are `@Directive`, so a DECORATOR KIND was inferred
  from a FILENAME, and the repo's own `b100/require-standalone-directive` REQUIRES the flag there:
  removing one produced 1 eslint error.
  A count cannot tell a declaration from a comment, a decorator kind from a naming convention, or a use
  from a mention. RULE: a grep may only LOCATE a candidate — before any count becomes a claim, OPEN the
  hits and read them in context, or ask the tool that OWNS the semantics: the compiler, the linter, the
  module loader. And this is worse inside a brief than inside a report, because a `MEASURED:` marker
  transfers your certainty to someone who cannot see how you arrived at it.
  **FIFTH FACE — A MANIFEST IS A STRUCTURED DOCUMENT, NEVER A LINE RANGE**, and this one nearly
  shipped a broken release. Measured 2026-09-09: I told the owner that task #56 — *how the two lint
  plugins reach a CONSUMER* — was still open, citing that `package.json` lines 295-296 still carry
  `git+http://` specifiers. The string was there; the grep was right. But those two lines are
  **devDependencies**: how THIS REPO fetches its own lint tooling. The consumer contract is a
  different key in a different section — `peerDependencies: "@base100/stylelint-plugin": "^1.0.0"`
  with `peerDependenciesMeta.optional: true` — already a registry range, already correct. Parsing the
  manifest into sections settles it in one call, and also shows why: `exports` carries
  `"./stylelint": "./.stylelintrc.json"`, whose line 6 names that plugin, so the optional peer is
  load-bearing — while there is **no `./eslint` export at all**, so the eslint plugin deliberately
  never crosses the packaging boundary. #56 was already closed by the existing architecture.
  Acting on my framing would have broken the release, not merely wasted time: `npm install
  --package-lock-only` exits 0 and reports "up to date" while the RESOLUTIONS at
  `package-lock.json:4413` and `:4435` still read `git+http://…#<sha>`, so the commit would ship a
  manifest claiming registry resolution over a lockfile that still clones from git — and
  `.gitlab-ci.yml` carries no registry auth, so every pipeline would then fail E401.
  RULE: before any verdict about a dependency, PARSE the manifest and name the SECTION the key lives
  in. The same package name in two sections answers two different questions, and a task about the
  CONSUMER contract can never be settled by a devDependency line.
  **SIXTH FACE — AN ACTOR IS IDENTIFIED BY A LOOKUP, NEVER BY WHAT ITS OUTPUT IS ABOUT**, and this one
  nearly destroyed an hour of a worker's finished work. Measured 2026-09-09: the owner showed a
  screenshot of an agent report about visual baselines and asked why that already-integrated agent was
  still active. I answered that it was the salvage agent, completed four hours earlier — because the
  report TEXT matched my memory of that agent. The owner then showed the actual status row: *"Saving
  visual-baselines CREDENTIAL findings to memory"* — a DIFFERENT agent, alive, whose worktree held 321
  changed lines in `visual-baselines.ts` plus 212 new spec lines, none of it committed, at the exact
  moment it was about to commit. Two agents shared a topic, so topic could not discriminate between
  them: a probe with no NO to give. And I had run `ListAgents` in that same turn and SEEN one agent
  running and one completed — I had the discriminating data in hand and overrode it with a content
  match. RULE: identify an actor by identity evidence — id, live status, start time, its worktree
  contents — never by subject matter. When two actors share a topic, the topic is not evidence about
  which one you are looking at. And an artifact the owner is SHOWING me outranks my recollection of
  who produced something similar; the cost of getting it wrong is that they act on my answer, and here
  the action they asked for was to kill it.

  **SEVENTH FACE — DEDUPLICATION IS A VERDICT ABOUT IDENTITY, and a right answer can hide a broken
  method** (`audit-verdict-from-commit-subjects-not-from-reading`). Measured 2026-09-09, twice in one
  task on the same symbol. A member census over a class extracted identifiers with a character class
  that omitted `$`, so `readonly displayedRows$: Observable<T[]>` truncated to `displayedRows` and
  collapsed onto the adjacent `readonly displayedRows: Signal<T[]>` under `sort -u`. It reported
  **179 declarations where there are 180**, and separately **107 template members where there are 108**.
  The root is not the missing character. **Deduplicating by NAME asserts that the name identifies the
  member**, and the RxJS `x$` / `x` convention makes that false BY CONSTRUCTION — precisely in the pairs
  where an Observable and its Signal coexist, which is exactly the population a store census is about.
  The half that makes this worse than a miscount: the census still reached the CORRECT public total of
  177, by `179 − 2 statics` where the true path is `180 − 2 statics − 1 constructor`. **A right answer
  obtained through a wrong intermediate conceals the broken method**, and this one did not stay put —
  179 propagated into a downstream design artefact and was carried in two of its sections.
  RULE: a census over a class counts DECLARATIONS, never deduplicated names, and any identifier class
  includes `$`. And the general half: **a final figure matching expectation does not validate the path.**
  If the intermediate was never checked, the agreement may be coincidence, and the method that produced
  it is still live and will produce the next number unexamined.


## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-30 — audit-verdict-from-commit-subjects-not-from-reading: now a binding rule in the delegated-worker contract (all 2 files); no mechanism is possible: No hook can tell whether a backlog line or brief sentence claiming a defect is open rests on a compiler reproduction or only on a located call site; the defect is in the inference after a legitimate read. What stands in place: the located-line face in both worker contracts, and briefs that carry a located line only under HYPOTHESIS.; full incident history in ~/.claude/failure-capture/state/incidents.jsonl <!--fc:audit-verdict-from-commit-subjects-not-from-reading#11-->

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
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
  - **A FILE'S SHARE JUDGED FROM ITS LOUDEST TOKENS (2026-09-30,
    `audit-verdict-from-commit-subjects-not-from-reading`).** I told the owner a rules file was mostly
    specific to one project, from the project names that stood out in it; classified entry by entry,
    1 of 14 was. RULE: a claim about what share of a file or list belongs to a category is made only
    after classifying every entry by reading it, and the sentence carries the count (N of M).
  - **ENTRIES CALLED DUPLICATES FROM THEIR SHARED LABEL (2026-09-30,
    `audit-verdict-from-commit-subjects-not-from-reading`).** I proposed unloading 13 ledger stubs as
    copies of the promoted rules; compared one by one, 5 of 13 carried a mechanism path found nowhere
    else. RULE: "duplicate" is a share claim too — compare every entry against its supposed copy
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
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/audit-verdict-from-commit-subjects-not-from-reading.md`.
````
