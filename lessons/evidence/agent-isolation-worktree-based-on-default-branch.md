# `agent-isolation-worktree-based-on-default-branch` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-11 (condensed)

- [global] 2026-10-11 — Three workers launched with Agent isolation:worktree got a worktree at origin/HEAD (main = 7f5fe05 'Initial commit', README only) instead of the current branch feature/meet, so all three stopped with no project -> root cause: the harness bases isolation worktrees on the remote default branch, and this repo's default branch is an empty root, plus this repo has no node_modules provisioner -> RULE: in a repo whose default branch is not the working line, never use isolation:worktree; create the worktree yourself from the exact commit (git worktree add -b <branch> <path> <sha>), give it node_modules (junction to the main checkout's), verify HEAD/entries/clean, then launch the worker without isolation and with a TENANCY line naming that path. <!--fc:agent-isolation-worktree-based-on-default-branch#1-->
