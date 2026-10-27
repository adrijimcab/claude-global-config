# `junctioned-node-modules-broke-vitest-coverage` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-27 (captured)

- [global] 2026-10-27 — A worktree provisioned with node_modules as a junction to the main checkout ran every Vitest spec green (5899/5899) but test:all exited 1: Vite resolves the junction to its real path outside the worktree root and refuses to serve @vitest/coverage-v8/browser, so the landing was refused -> root cause: the provisioner shared node_modules by junction, an assumption carried from the Karma era RULE: A worktree that runs Vite or Vitest gets its own node_modules from the lockfile (npm ci in that worktree), never a junction to another checkout's; the provisioner refuses a linked node_modules. <!--fc:junctioned-node-modules-broke-vitest-coverage#1-->
