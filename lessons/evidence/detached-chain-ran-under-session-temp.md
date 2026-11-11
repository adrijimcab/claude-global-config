# `detached-chain-ran-under-session-temp` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-10 (captured)

- [global] 2026-11-10 — I launched the b3 landing detached from the Bash tool, whose TEMP is the per-session folder that SessionEnd deletes; its 57 extra characters pushed the integrate fixture past Windows MAX_PATH and turned 3 green selftest suites red (run 20261110-104750-51316) -> root cause: the detached launcher passes the caller's environment through, and two selftests read their fixture shape from os.tmpdir() (an 8.3 spelling, a path budget) instead of constructing it RULE: A detached or long-lived chain runs under a TEMP that belongs to no session, and a fixture whose shape depends on TEMP constructs that shape or refuses a TEMP it cannot fit as a named precondition. <!--fc:detached-chain-ran-under-session-temp#1-->
