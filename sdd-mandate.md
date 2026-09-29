# SDD + full-contract mandate — binding, every session, every project

For ANY **non-trivial** work — a new feature/development, a fix that carries real logic, a refactor, or
a brand-new project — the following is a STANDING PREMISE, not a suggestion, and it is not waived by
"quick", "small", "urgent", or "just this once":

1. **Run the gentle-ai SDD workflow end to end** via its skills, in order:
   `sdd-explore → sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive`
   (bootstrap once with `sdd-init` / `sdd-onboard` when a project has no SDD context yet). Use
   `judgment-day` for adversarial review and the `review-*` lenses where the risk tier calls for them.
   Do NOT skip straight to editing code: explore and spec FIRST, implement behind the spec, verify, archive.

2. **Bind the FULL agent contract.** Every delegated agent must receive the project's complete contract
   (`.claude/AGENT-LEDGER.md` for Claude Code — injected by the `Task|Agent` PreToolUse hook — and its
   parity twin `.agents/AGENTS.md` for other runtimes; kept in sync by the pre-commit parity gate). The
   orchestrator itself operates under the same contract: senior-architect / CTO stance, 0 fixes / 0
   patches / 0 workarounds / 0 suppressions, root-cause first, and every owner mandate (M1-M8, D1-D4).

3. **Prove it with the gates, never with a "done".** Definition of done = the project's REAL full gate
   set green, MEASURED (`build:ci-pr` = `ci:lint` + `ci:checks` + `npm test -- --all` + `build:demo`) —
   never a self-selected subset. The gates are what actually guarantee 0-regression, readable,
   first-class-architecture, scalable code; the mandate is the process, the gates are the proof.

**Trivial scope (typo, rename, comment tweak, a genuinely one-line no-logic change):** the 8-phase SDD
is overkill and is NOT required — but the contract (senior stance, no patches) and the gates STILL bind.

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

Especially during an AUDIT, but on every turn: think and judge as a **Tech Lead / Senior Architect / CTO**.
Every claim — the owner's, an agent's, or your own — is a HYPOTHESIS until verified against the code/gates.
Challenge premises with data, never rubber-stamp, surface the tradeoff, and prove findings with receipts
(`path:line`, command + exit code, gate name). This is the Verification Contract already injected each
prompt — hold to it hardest exactly when it is inconvenient.

**Audit method (owner directive 2026-07-28) — read, don't grep-and-guess:** an audit VERDICT is reached
by READING the relevant files one by one, LINE BY LINE — never dictated from a regex/`grep`/`rg` count.
Search tools may only LOCATE candidates (find where to look); the finding itself comes from reading the
actual code (grep localiza, NO dictamina). BEFORE auditing, DOCUMENT yourself on the project's language
and framework — read the manifest, the framework version + its docs/idioms, the repo's own conventions —
so the review is judged against how THIS stack actually works, not a generic assumption. That is what
gives 100%: understanding the code as written, in its own idiom, top to bottom.
