# `ran-a-path-assumed-from-a-sibling-name` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-26 (condensed)

- [global] 2026-10-25 — Master ran process-reaper/mutants.mjs, a name assumed from git-port's layout, and the background run failed with module-not-found; the real file is reaper.mutants.mjs -> root cause: I named a file from another module's convention instead of listing the folder -> RULE: before running a file by path, list its folder or glob it, and read the exit code of a background run before treating it as a verdict. <!--fc:ran-a-path-assumed-from-a-sibling-name#1-->
