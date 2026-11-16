# `mutant-campaign-left-unrun-after-its-target-moved` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — The T17 worker inserted tempDir into the job and runner text that three detach mutants targeted and never ran the detach campaign, so it refused to measure (ABSENT, 0 occurrences) only at landing time; fixed in d3d2610 -> root cause: a change to a file was not followed by the campaign of every mutant list that targets that file RULE: A change to a file runs every mutation campaign whose mutants target that file (mutation-proof/scope.mjs), before the unit is reported done. <!--fc:mutant-campaign-left-unrun-after-its-target-moved#1-->
