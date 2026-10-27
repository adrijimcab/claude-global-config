# `e2e-artifacts-overwritten-by-rerun` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-27 (captured)

- [global] 2026-10-27 — After the final full e2e failed twice on mobile, I re-ran the two specs in the same Discovery-FE folder; Playwright clears test-results at the start of every run, so the screenshots, videos and error contexts of the two failures were deleted before anyone read them -> root cause: the re-run used the default output folder of the run that held the evidence RULE: Before re-running any Playwright spec after a failed run, copy that run's failure artifacts out of test-results, or give the re-run its own --output folder. <!--fc:e2e-artifacts-overwritten-by-rerun#1-->
