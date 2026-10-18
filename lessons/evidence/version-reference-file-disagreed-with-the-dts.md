# `version-reference-file-disagreed-with-the-dts` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-18 (condensed)

- [global] 2026-10-18 — The Angular version matrix and v22.md stated API statuses (DP for incremental hydration and resource on 19, reportProgress deprecated in 22) that the published d.ts files contradict (@experimental on 19.2.25, no deprecation on 22.2.1); a hand-written reference summarises releases and drifts from them -> RULE: an API-status claim taken from a version reference file is checked against the d.ts of the exact installed or target version before it decides anything, and a mismatch goes to the file's owner the same turn. <!--fc:version-reference-file-disagreed-with-the-dts#1-->
