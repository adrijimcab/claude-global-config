# `git-restore-left-staged-content` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-07-29 — Tras un `git add` cuyo commit bloqueó un hook, `git restore <path>` NO limpió nada: restaura el árbol DESDE EL ÍNDICE, y el índice ya tenía el contenido nuevo → RULE: para descartar de verdad tras un commit bloqueado hace falta `git restore --staged --worktree <path>` (ambos niveles); `M ` en la PRIMERA columna de `git status --porcelain` significa staged, y es la señal de que un restore simple no basta.
