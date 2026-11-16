# `worker-reported-clean-tree-over-stale-index` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — program-info-parity T3b: after commit d2371232 lint-staged rewrote two files; the worker reported "tree equals HEAD" (git diff HEAD empty) while `git status` showed MM with the pre-format content staged, which the next commit would have reverted; the orchestrator ran git restore --staged on those paths (backlog 630) -> root cause: git diff HEAD compares the worktree with HEAD and does not see the index RULE: After any commit, report git status --porcelain and git diff --cached --stat, never only git diff HEAD; staged leftovers whose worktree equals HEAD are unstaged with git restore --staged before the next commit. <!--fc:worker-reported-clean-tree-over-stale-index#1-->
