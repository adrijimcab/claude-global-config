# `ui-capture-taken-before-data-loaded` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-04 (condensed)

- [global] 2026-10-01 — The owner found study screenshots showing only a loading spinner and pages cut above the fold (projectInfo has more metrics below) -> root cause: my capture brief asked for screenshots of default and states but defined no readiness condition, no scroll pass and no console capture, so workers captured on navigation and a slow API looked like the screen -> RULE: any UI capture brief states the readiness predicate (network settled + every loader gone + real content present, bounded timeout reported as such), a full scroll of page and inner containers before a full-page shot, per-interaction console/pageerror/requestfailed/HTTP>=400 capture, and a self-check of every saved image. <!--fc:ui-capture-taken-before-data-loaded#1-->
