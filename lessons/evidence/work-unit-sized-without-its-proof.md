# `work-unit-sized-without-its-proof` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-09-30 (captured)

- [global] 2026-09-30 — Three work units of the ledger-tiering change overran the binding 400-line budget the orchestrator set (2a 683, 3b 468, 4a-iii 480), each blocking the native attempt ledger on a maintainer reset; every brief stated the budget as binding with stop-and-report, and the workers either split into commits, left work uncommitted (which the ledger still counts) or did not count until done. Root cause: the orchestrator sized units from the design's estimates of product code, while the selftest and mutants files that every unit must carry run roughly twice as long as the product module. RULE: Size a work unit by its product code plus its selftest and mutation proof, which run about twice the product code; plan units of at most about 130 lines of product code so the whole unit stays under the 400-line budget. <!--fc:work-unit-sized-without-its-proof#1-->
