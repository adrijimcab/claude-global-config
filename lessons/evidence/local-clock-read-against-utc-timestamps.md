# `local-clock-read-against-utc-timestamps` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-10 (captured)

- [global] 2026-11-10 — 2026-11-10: told the owner a mutation campaign had run 70 min and diagnosed an 80-minute anomaly, by subtracting a 15:32Z start (UTC, from the run directory name and verdict) from a shell date of 16:43 Madrid local; the campaign had run 11 min and took 14 -> root cause: two clocks compared without reading their zones RULE: Before subtracting two timestamps, read the zone of each (a trailing Z is UTC; the shell date is local) and convert to one zone, or measure durations from the same source (verdict startedAt and endedAt). <!--fc:local-clock-read-against-utc-timestamps#1-->
