# `worker-temp-file-collided-across-sessions` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (condensed)

- [global] 2026-10-12 — Two workers on 2026-10-12 hit files of the same name in the shared TEMP directory. One found another session's edit6.mjs; the other got a stranger's commit message, because the m1.txt it committed with had been written by another session. -> root cause: briefs said to write temporary files (scripts, commit messages) without naming a place, so workers used the TEMP directory that every session shares, under short generic names. -> RULE: a worker writes temporary files only in its own worktree or its session scratchpad, under unique names, and briefs say so. Mechanism requested: refuse a delegated agent's write or commit -F that targets the shared TEMP root. <!--fc:worker-temp-file-collided-across-sessions#1-->
