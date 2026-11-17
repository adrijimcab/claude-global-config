# `mirror-failed-silently-past-the-command-line-cap` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-17 (condensed)

- [global] 2026-11-17 — The engram mirror of odd/tasks/angular-22-upgrade.md exited 1 with no output once the document reached 33,297 characters -> root cause: engram takes content only as a command-line argument, Windows caps a command line at 32,767 characters, spawn fails before the process starts, and the script printed only the child stdout/stderr, which a spawn error leaves empty; its read-back was a search, not a content comparison -> RULE: a mirror into engram splits content into parts below the command-line cap, names every spawn error and exit code, and proves the write by rebuilding the document from an engram export and comparing it byte for byte. <!--fc:mirror-failed-silently-past-the-command-line-cap#1-->
