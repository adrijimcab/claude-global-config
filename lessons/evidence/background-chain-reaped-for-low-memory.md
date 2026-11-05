# `background-chain-reaped-for-low-memory` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-05 (captured)

- [global] 2026-11-05 — Around 00:40 on 2026-11-05 the harness reaped all three T25/T27/T29 background mutation campaigns for low system memory: T25 at mutant 34/121 holding the full-chain lock, T27 and T29 while still waiting on it; free memory read 37.4 of 63.7 GB minutes later, so the peak had passed. Second occurrence after the gate run reaped on 2026-10-05 (full-chain-lock/messages.mjs:126). Measured cause pending: the T25 campaign is being re-run with a 3 s sampler of free memory and node/git footprint (scratchpad mem-t25.log) -> root cause: NOT YET MEASURED RULE: A background chain that the harness reaps for memory is re-run with a memory sampler beside it before anything else is launched, and the concurrency of the engine that ran it is bounded by measured memory per unit. <!--fc:background-chain-reaped-for-low-memory#1-->
