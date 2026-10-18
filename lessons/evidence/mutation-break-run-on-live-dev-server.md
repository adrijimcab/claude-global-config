# `mutation-break-run-on-live-dev-server` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-18 (captured)

- [global] 2026-10-18 — 2026-10-18 Discovery e2e writers proved specs by breaking source under a live ng serve; twice the break run was corrupted: (1) a break that did not compile (TS6133) left the previous bundle served, so a spec stayed green; (2) a versions spec went red once (30 s timeout) while sources were being mutated, then passed 360 of 360 on a stable server -> root cause: the live dev server either keeps the last good bundle on a compile error or reloads open pages mid-test after each rebuild, so a break run measures a server state nobody controlled RULE: A mutation break run uses a dev server without live reload (ng serve --live-reload=false) and starts only after a new clean 'bundle generation complete' with no new ERROR line; a break that does not compile is invalid, never a result. <!--fc:mutation-break-run-on-live-dev-server#1-->
