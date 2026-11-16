# `landing-queued-beside-its-unfinished-campaign` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — The T17 landing was queued on the lock at the same moment as the campaign that had to clear it; the lock orders neither, so the landing could run before the mutants were known; killed while it waited (run 20261111-164315656) -> root cause: two dependent steps were launched as if independent RULE: A landing is launched only after the campaign that clears it has a green verdict read with run.mjs --read, never queued beside it. <!--fc:landing-queued-beside-its-unfinished-campaign#1-->
