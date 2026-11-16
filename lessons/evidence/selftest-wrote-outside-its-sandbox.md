# `selftest-wrote-outside-its-sandbox` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — detach.selftest left fcl/<8 hex> in its TEMP and session-processes/selftest left claude/session-tmp in its TEMP, wrote AppData/Roaming in its home and, run standalone, made session folders in the real shared session-tmp; the selftest runner sandbox refused the T17 landing run 20261111-163558504; fixed in 2413001 and 93f795a -> root cause: the proofs let their children inherit the TEMP and home they were given RULE: A proof that starts processes gives them a TEMP, a profile and every root they write under inside its own scratch, and is run once with an empty TEMP and home to show nothing is left. <!--fc:selftest-wrote-outside-its-sandbox#1-->
