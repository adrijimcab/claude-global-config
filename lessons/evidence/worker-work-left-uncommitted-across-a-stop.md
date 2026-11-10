# `worker-work-left-uncommitted-across-a-stop` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-05 (condensed)

- [global] 2026-10-05 — Twice in one day a session-limit stop found workers with hours of edits and 0 commits (meet-18/19/20 at 14:52, meet-18 again at 19:52) -> 'commit as you go' lived only in the brief and nothing protected the work when a worker could not commit (WIP that does not typecheck cannot pass the hook) -> RULE: the orchestrator runs a periodic snapshot of every live worktree's uncommitted diff and untracked files outside the tree, and checks commit counts at every worker notification. <!--fc:worker-work-left-uncommitted-across-a-stop#1-->

## Ledger line archived 2026-11-10 (promoted)

- [guards] 2026-10-05 — RULE: the orchestrator runs a periodic snapshot of every live worktree's uncommitted diff and untracked files outside the tree, and checks commit counts at every worker notification. Evidence: lessons/evidence/worker-work-left-uncommitted-across-a-stop.md <!--fc:worker-work-left-uncommitted-across-a-stop#3-->

Promoted 2026-11-10 to ~/.claude/rules/promoted-guards.md; closed by mechanism C:/Users/adrian.jimenez/.claude/commit-cadence-guard/guard.mjs (selftest run, exit 0)
