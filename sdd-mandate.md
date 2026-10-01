# Route + full-contract mandate — binding, every session, every project

Every change takes one of three routes, chosen by how settled its DESIGN is — never by its size, its
risk, or how urgent it feels. Points 2 and 3 bind on all three.

1. **SDD where the design is open.** This paragraph is the owner's standing explicit request for the
   SDD route, which is what the orchestrator contract requires before SDD is selected. It covers a new
   feature, a new project, a refactor that crosses a module boundary or changes a public API, and any
   change whose approach is still undecided when the work starts. Run the workflow end to end via its
   skills, in order:
   `sdd-explore → sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive`
   (bootstrap once with `sdd-init` / `sdd-onboard` when a project has no SDD context yet). Use
   `judgment-day` for adversarial review and the `review-*` lenses where the risk tier calls for them.
   Explore and spec first, implement behind the spec, verify, archive.

   **Direct (inline or delegated) where the design is settled.** A fix whose root cause has been
   measured and whose solution has one evident shape, or a contained change inside one module, goes
   direct: root cause first, then the change, then the gates. When a direct change turns out to need a
   design decision nobody has made, stop and move it to the SDD route rather than deciding it in the
   diff.

2. **Bind the FULL agent contract.** Every delegated agent must receive the project's complete contract
   (`.claude/AGENT-LEDGER.md` for Claude Code — injected by the `Task|Agent` PreToolUse hook — and its
   parity twin `.agents/AGENTS.md` for other runtimes; kept in sync by the pre-commit parity gate). The
   orchestrator itself operates under the same contract: senior-architect / CTO stance, 0 fixes / 0
   patches / 0 workarounds / 0 suppressions, root-cause first, and every owner mandate (M1-M8, D1-D4).

3. **Prove it with the gates, never with a "done".** Definition of done = the project's REAL full gate
   set green, MEASURED, as that project's own `CLAUDE.md` or agent contract declares it (in b100-am-ui,
   `build:ci-pr` = `ci:lint` + `ci:checks` + `npm test -- --all` + `build:demo`) — never a
   self-selected subset. The gates are what actually guarantee 0-regression, readable,
   first-class-architecture, scalable code; the route is the process, the gates are the proof.

**Trivial scope (typo, rename, comment tweak, a genuinely one-line no-logic change):** goes direct
inline; the contract (senior stance, no patches) and the gates still bind.

If SDD or a skill is genuinely unavailable in the current environment, say so plainly and apply the
stance + gates manually — never silently drop the process and never fake it.

## Tooling leverage — reach for the BEST tool, and seek one for anything new

A first-class product comes from a good base, and a good base is the RIGHT tool well used — not
reinvention, and not hoarding. So, as a standing premise:

- **Proactively use the best available skill / plugin / MCP tool for the task at hand** instead of
  hand-rolling. Match the tool to the job: `playwright` for browser / e2e / visual work; `frontend-design`
  for UI craft and visual quality; `context7` for up-to-date library/API docs; the `review-*` lenses and
  `judgment-day` for adversarial review; `feature-dev` for architecture/exploration; the SDD skills for
  the workflow. If the ecosystem already does it better than you would by hand, USE it.
- **Before tackling anything new or unfamiliar, first ask "is there a plugin/skill/MCP that makes us
  better at this?"** — check the installed set (and `/plugin` for available ones) and adopt it rather than
  starting cold. Bringing in the right tool for a new domain is part of doing the work well, not a detour.
- **Curate, don't accumulate.** "Use every plugin always" is an anti-pattern: the wrong tool, or dozens of
  unused ones, bloats context (the skill listing has a budget) without adding value. Leverage a plugin
  aggressively WHEN it helps the task; a plugin that never earns its place is a candidate to prune. A good
  base is curated and intentional.

## Audit / senior stance — judge everything, always (reinforces the Verification Contract)

**Audit method (owner directive 2026-07-28) — read, don't grep-and-guess:** an audit VERDICT is reached
by READING the relevant files one by one, LINE BY LINE — never dictated from a regex/`grep`/`rg` count.
Search tools may only LOCATE candidates (find where to look); the finding itself comes from reading the
actual code (grep localiza, NO dictamina). BEFORE auditing, DOCUMENT yourself on the project's language
and framework — read the manifest, the framework version + its docs/idioms, the repo's own conventions —
so the review is judged against how THIS stack actually works, not a generic assumption. That is what
gives 100%: understanding the code as written, in its own idiom, top to bottom.
