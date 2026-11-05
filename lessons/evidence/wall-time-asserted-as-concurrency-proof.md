# `wall-time-asserted-as-concurrency-proof` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-04 (captured)

- [global] 2026-11-04 — On 2026-11-04 the landing of fix/mg-t24-async-runner went RED 185/186: judge-gate/selftest.mjs proved that spawnAsync runs children at once by a wall-time bound (three 400 ms children under 1100 ms), which failed once the parallel selftest runner loaded the machine although the children did overlap -> root cause: a concurrency claim checked by a clock measures the machine, not the code; fixed with a meeting (each child waits for the marks of the others; one at a time the same children give [1,1,0]), commit 4324bcb RULE: Concurrency is proved by a condition that holds only when the units overlap (a meeting of marks with a deadline), never by a wall-time bound, and the near miss run one at a time is shown red. <!--fc:wall-time-asserted-as-concurrency-proof#1-->
