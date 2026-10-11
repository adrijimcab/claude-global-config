# `worker-git-stash-shared-across-worktrees` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-11 (condensed)

- [global] 2026-10-11 — Two workers in linked worktrees of one repo shared one stash stack: f5 ran git stash push/pop to record a red run, f4 pushed its lint-staged backup in between, and f5 popped f4's stash into its own worktree; f4 then failed with "lint-staged automatic backup is missing" (reported by session push-commit-4c04bdb-feature-meet on 2026-10-11) -> root cause: refs/stash is one ref for every linked worktree, used both by manual stash and by lint-staged's backup -> RULE: a worker never runs git stash (it commits work in progress on its own branch); mechanism: worker-stash-guard on branch docs/incident-mechanism. <!--fc:worker-git-stash-shared-across-worktrees#1-->
