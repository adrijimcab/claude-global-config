# `liveness-read-from-transcript-mtime-only` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (captured)

- [global] 2026-10-12 — The integrated-worktree guard asked to remove a worktree whose worker was launched minutes earlier and had not written yet, and tenancy read a finished worker as live for 30 min -> root cause: agent-liveness decides only from transcript mtime, never from the agent lifecycle RULE: Agent liveness is read from the recorded SubagentStart/SubagentStop lifecycle first, and from transcript mtime only for agents with no lifecycle record; mechanism in progress on fix/agent-lifecycle-liveness. <!--fc:liveness-read-from-transcript-mtime-only#1-->
