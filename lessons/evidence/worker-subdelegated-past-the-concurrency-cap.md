# `worker-subdelegated-past-the-concurrency-cap` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-09-30 — A bilingual-campaign worker I launched (a6bcb38a) spawned 6 child agents of its own, each running vitest in its own worktree, while a full integrate.mjs build:ci-pr was running and two other workers were live, exceeding the owner's cap of 3 heavy workers (#971) -> root cause: my brief never said the worker may not delegate, and a large disjoint workload invites fan-out -> RULE: every brief states 'do not spawn sub-agents; if the work is too large, report the partition and stop', and the orchestrator splits large campaigns itself within the cap. <!--fc:worker-subdelegated-past-the-concurrency-cap#1-->
