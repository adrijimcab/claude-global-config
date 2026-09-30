# `recursive-delete-followed-a-junction` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-08-03 — Iba a limpiar 184 worktrees huérfanos con `rm -rf` desde Git Bash; al inspeccionar primero, cada uno contenía SOLO `node_modules` y `Get-Item .LinkType` = **Junction** apuntando al `node_modules` PRINCIPAL (1211 entradas) → un borrado recursivo que siga el reparse point habría destruido el node_modules real, rompiendo el repo y los 4 agentes vivos → RULE: en Windows, antes de borrar recursivamente cualquier árbol creado por tooling, comprobar reparse points (`Get-Item -Force | Select LinkType,Target`); eliminar con `cmd /c rmdir /S /Q`, que quita el enlace SIN seguirlo, y PROBAR con UNO verificando que el destino sigue intacto antes del lote. Corolario de causa raíz: `git worktree remove` borra lo que git rastrea y deja el junction que el provisioner creó y git desconoce — por eso el directorio sobrevive y el segador informa de un éxito que no verificó.
