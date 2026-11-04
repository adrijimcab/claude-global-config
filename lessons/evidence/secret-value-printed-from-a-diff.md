# `secret-value-printed-from-a-diff` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-03 (captured)

- [global] 2026-11-03 — On 2026-11-03 I printed the added lines of back commit 1882fcea grouped by text, to see what was not token code; the output showed the values of SECRET and HAS_PASS from a committed .env file -> root cause: I printed raw diff lines of a security commit without first excluding .env files and masking assignments. RULE: Before printing any line of a diff or file that may hold credentials, exclude .env and config files by path and mask every KEY=value; list paths and counts, never values. <!--fc:secret-value-printed-from-a-diff#1-->

## Ledger line archived 2026-11-04 (captured)

- [global] 2026-11-04 — Restored ledger line, originally captured 2026-11-03: the 2026-11-04 master landing (99ac083) reset the live ledger to the landed tree, which did not hold this capture -> root cause: capture output written to the live ledger after the branch point was replayed after alignment instead of carried into the branch before landing RULE: Before printing any line of a diff or file that may hold credentials, exclude .env and config files by path and mask every KEY=value; list paths and counts, never values. <!--fc:secret-value-printed-from-a-diff#1-->
