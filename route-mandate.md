# Route + full-contract mandate — binding, every session, every project

Every change runs through ODD (gentle-ai v4). Owner order of 2026-10-18 («TODO LO QUE TENGA O PUEDA PASAR
POR ODD QUE PASE»): every change that is not of trivial scope (defined at the end of this file) is TRACKED,
however small or settled; only trivial scope goes direct. Points 2 and 3 bind on both. This is stricter than
gentle-ai's own small path (no feature document for small work), and the owner's order prevails.

1. **Tracked ODD for every non-trivial change.** A new feature, a project, a refactor, a fix whose root
   cause is measured and whose shape is evident, a guard, a rule text, a config change: all of them.
   Explore, resolve the open decisions, and TRACK before the first write: `odd/tasks/<feature>.md`
   and its engram mirror `odd/<feature>/tasks` carry the decided design and why, the tasks and their
   checks. The document is a working copy that no git repository versions (company clone, tooling backup
   and this config alike: `/odd/` excluded or ignored in each); its durable copy is the engram mirror, written
   by the orchestrator and kept current after every task.
   Each task closes with a work-unit commit recorded in the document. Every step that measures
   a unit (the document, its commit, `gentle-ai review assess --cwd --base-ref`) runs in the unit's own
   worktree with its own base, never the integration checkout. Every unit of medium or high risk gets an
   outside view BEFORE it lands: the native `review-*` lenses when `gentle-ai review assess` marks it
   `high_risk`, and a `judgment-day` (two blind judges on the frozen base..head) when it is medium, since
   gentle-ai 4.2.0 reviews only high risk (its `CLAUDE.md` entry rule). Low and passive units need none.
   A one-step change is a feature document with one task: the tracking costs a few lines, and in exchange
   the decision, its evidence and its commit survive an interruption or a compaction.

2. **Bind the FULL agent contract.** Every delegated agent must receive the project's complete contract
   (`.claude/AGENT-LEDGER.md` for Claude Code — injected by the `Task|Agent` PreToolUse hook — and its
   parity twin `.agents/AGENTS.md` for other runtimes; kept in sync by the pre-commit parity gate). The
   orchestrator itself operates under the same contract: senior-architect / CTO stance, 0 fixes / 0
   patches / 0 workarounds / 0 suppressions, root-cause first, and every owner mandate (M1-M8, D1-D4).

3. **Prove it with the gates, never with a "done".** Definition of done = the project's REAL full gate
   set green, MEASURED, as that project's own `CLAUDE.md` or agent contract declares it (in b100-am-ui,
   `build:ci-pr` = `ci:lint` + `ci:checks` + `npm test -- --all` + `build:demo`) — never a
   self-selected subset. That full run happens ONCE, at the end, by the orchestrator on the tree being
   integrated; during the work every task and worker runs only the gates that read what it changed.

**Trivial scope (typo, rename, comment tweak, a genuinely one-line no-logic change):** goes direct
inline with no feature document; the contract (senior stance, no patches) and the gates still bind.

If ODD tracking or a skill is genuinely unavailable, say so plainly and apply the stance + gates
manually — never silently drop the process and never fake it.

## Tooling leverage — reach for the BEST tool, and seek one for anything new

- **Proactively use the best available skill / plugin / MCP tool for the task at hand** instead of
  hand-rolling.
- **Before tackling anything new or unfamiliar, first ask "is there a plugin/skill/MCP that makes us
  better at this?"**
- **Curate, don't accumulate.** "Use every plugin always" is an anti-pattern: the wrong tool, or dozens of
  unused ones, bloats context (the skill listing has a budget) without adding value.

## Audit / senior stance — judge everything, always (reinforces the Verification Contract)

**Audit method (owner directive 2026-07-28) — read, don't grep-and-guess:** an audit VERDICT is reached
by READING the relevant files one by one, LINE BY LINE — never dictated from a regex/`grep`/`rg` count.
Search tools may only LOCATE candidates (find where to look); the finding itself comes from reading the
actual code (grep localiza, NO dictamina). BEFORE auditing, DOCUMENT yourself on the project's language
and framework — read the manifest, the framework version + its docs/idioms, the repo's own conventions —
so the review is judged against how THIS stack actually works, not a generic assumption.
