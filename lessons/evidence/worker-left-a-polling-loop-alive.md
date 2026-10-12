# `worker-left-a-polling-loop-alive` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (captured)

- [global] 2026-10-12 — A worker in agent-a83a72cee352af81b started a background bash until-loop on 2026-10-11 17:46 waiting for reports/mutation/mutation.json; the worker ended and its worktree was removed, but the loop kept running ~18 h until the owner saw two shells and asked to kill them; my stop sweep on 2026-10-12 matched only node processes, so it missed it -> root cause: a polling loop has no owner once its worker ends, and the orchestrator's process sweep was scoped to node RULE: When a worker stops or its worktree is removed, the orchestrator sweeps every process (bash included) whose command line names that worktree and kills it; a worker never polls with a sleep loop. <!--fc:worker-left-a-polling-loop-alive#1-->
