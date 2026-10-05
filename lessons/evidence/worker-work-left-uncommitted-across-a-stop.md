# `worker-work-left-uncommitted-across-a-stop` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-05 (condensed)

- [global] 2026-10-05 — Twice in one day a session-limit stop found workers with hours of edits and 0 commits (meet-18/19/20 at 14:52, meet-18 again at 19:52) -> 'commit as you go' lived only in the brief and nothing protected the work when a worker could not commit (WIP that does not typecheck cannot pass the hook) -> RULE: the orchestrator runs a periodic snapshot of every live worktree's uncommitted diff and untracked files outside the tree, and checks commit counts at every worker notification. <!--fc:worker-work-left-uncommitted-across-a-stop#1-->
