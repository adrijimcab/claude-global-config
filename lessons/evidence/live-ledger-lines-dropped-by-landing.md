# `live-ledger-lines-dropped-by-landing` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-04 (captured)

- [global] 2026-11-04 — On 2026-11-04 the orchestrator discarded the live ~/.claude/lessons-ledger.md (backed up) so land.mjs could fast-forward master to 99ac083, planning to re-capture the live-only lines after alignment; between the landing and the re-capture four lessons and two recurrence counts were absent from the live ledger, and the Discovery session found them missing -> root cause: capture output written after the branch point was replayed after the landing instead of carried into the branch before it, and nothing checks that a landing keeps every live ledger key and count RULE: Before a landing that resets the live ledger, the branch carries every live ledger key at its live count (replayed through capture.mjs in the branch, or the landing waits); a landing never leaves the live ledger with fewer keys or lower counts than before. <!--fc:live-ledger-lines-dropped-by-landing#1-->
