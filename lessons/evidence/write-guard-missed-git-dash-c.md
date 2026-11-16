# `write-guard-missed-git-dash-c` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-16 (captured)

- [global] 2026-11-16 — On 2026-11-16 the orchestrator staged and committed in ~/.claude-wt/mg-t66-hostile-sandbox with git -C from another cwd while full-suite run 20261116-184452348 measured that tree; the full-chain write guard refused an Edit there minutes earlier but let git -C add and commit through -> root cause: the guard resolves a git write against the caller cwd and does not read the -C directory RULE: The full-chain write guard reads the directory a git command acts on (-C, --git-dir, --work-tree) and refuses a git write into a tree a running chain measures, whatever the caller cwd. <!--fc:write-guard-missed-git-dash-c#1-->
