# `worker-gate-claim-landed-unrerun` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-18 (condensed)

- [global] 2026-10-18 — On 2026-10-18 the useless-escape-guard worker reported hook-state/census.selftest.mjs as 22 passed; I re-ran only its own selftest before integrating, and the checkpoint-42 landing went RED on that census (its stateDir journal was not classified in rotate.mjs). -> root cause: I verified the worker by its own selftest and trusted its report for the shared gates it named. -> RULE: before integrating a worker unit, re-run every gate its report names, the shared ones (census, hook-dispatch) above all, never only its own selftest. <!--fc:worker-gate-claim-landed-unrerun#1-->
