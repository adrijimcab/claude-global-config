# Route + full-contract mandate — binding, every session, every project

Every change runs through Organic Driven Development (ODD, gentle-ai v4) and takes one of two routes,
chosen by how settled its DESIGN is — never by its size, its risk, or how urgent it feels. Points 2 and 3
bind on both.

1. **Tracked ODD where the design is open.** A new feature, a new project, a refactor that crosses a
   module boundary or changes a public API, and any change whose approach is still undecided when the
   work starts. Explore first, resolve the open decisions (research with sources, or one question to the
   owner for a decision only the owner holds), and TRACK before the first write: the feature document
   `odd/tasks/<feature>.md` and its engram mirror `odd/<feature>/tasks` carry the objective, the decided
   design and why, the task list, and the checks of each task. Implement task by task, each closed by a
   work-unit Conventional Commit whose id is recorded in the document; close with the verified outcome.
   Use `judgment-day` for adversarial review and the `review-*` lenses where the risk tier calls for them.
   **Direct (inline or delegated) where the design is settled.** A fix whose root cause has been
   measured and whose solution has one evident shape, or a contained change inside one module, goes
   direct: root cause first, then the change, then the gates. When a direct change turns out to need a
   design decision nobody has made, stop and track it as above rather than deciding it in the diff.

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

If ODD tracking or a skill is genuinely unavailable in the current environment, say so plainly and apply
the stance + gates manually — never silently drop the process and never fake it.

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
