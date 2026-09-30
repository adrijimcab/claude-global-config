# `owner-command-written-for-the-wrong-shell` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-09-29 — Le pasé al dueño comandos con sintaxis bash (~ y &&) y él los corrió en su terminal de PowerShell 5.1, donde git -C no expande ~ y && no es un separador válido: ambos fallaron -> causa: escribí los comandos para mi Bash tool, no para la terminal del dueño -> RULE: todo comando que ejecuta el dueño se escribe para PowerShell 5.1 (rutas con $HOME, encadenar con ';' o Push-Location/Pop-Location) salvo que diga que usa otra shell. <!--fc:owner-command-written-for-the-wrong-shell#1-->
