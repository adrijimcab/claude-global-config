# `backlog-deferral-reason-not-measured` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (condensed)

- [global] 2026-10-12 — Orchestrator queued the version-control mutation gap as PENDING with reason 3 (would preempt work in flight, the tooling-names chain touches version-control.ts) without measuring it; tasks.md showed only the already-done 3.1 and 3.3 touch the file and no live worktree had it modified -> root cause: the reason was inferred from the unit just closed, not measured against the remaining tasks and live worktrees -> RULE: a deferral reason is a state claim; before writing PENDING with reason 3, grep the remaining tasks and every live worktree's diff for the path, and if nothing touches it, resolve it now. <!--fc:backlog-deferral-reason-not-measured#1-->
