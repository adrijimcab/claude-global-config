# `worker-handback-resent-by-its-own-timers` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-13 (captured)

- [global] 2026-10-13 — A chart worker that had already handed back its report re-sent the same report five times, because wait timers it had armed kept waking it after the hand-back -> root cause: a worker can leave its own timers alive after its final report, and each wake re-delivers the report RULE: After a worker's final report arrives, the orchestrator stops that task with TaskStop at the first repeated hand-back, and a worker never arms wait timers after its final report. <!--fc:worker-handback-resent-by-its-own-timers#1-->
