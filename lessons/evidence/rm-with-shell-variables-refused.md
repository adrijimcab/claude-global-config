# `rm-with-shell-variables-refused` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (condensed)

- [global] 2026-10-12 — Twice in session 5f411d3c (2026-10-11 and 2026-10-12) the orchestrator chained `rm "$H/$E"` after other steps in one Bash call; the harness safety check refused the WHOLE command because a shell-variable target can expand to the filesystem root, so the commit in the same call did not run either -> root cause: a removal was written with shell variables out of habit from the surrounding commands -> RULE: a removal names a literal absolute path (or `${VAR:?}` guards), and it runs in its own Bash call after the steps it depends on, never chained with a commit. <!--fc:rm-with-shell-variables-refused#1-->
