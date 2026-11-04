# `full-chain-lock-recorded-the-caller-cwd-as-tree` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-04 (captured)

- [global] 2026-11-04 — On 2026-11-04 the orchestrator wrapped land.mjs in full-chain-lock/run.mjs with the exact command the FULL-CHAIN GUARD refusal suggests, from the Discovery checkout as cwd; the suggestion carries no --tree, so the lock recorded di_1700002_discovery_fe as the measured tree while land.mjs verified ~/.claude-wt/mg-t24-runner, and the write guard then protected the wrong tree (it refused a commit in another worktree, and would have allowed writes in the tree under test) -> root cause: the refusal builds its suggested command without the measured root of the command it wraps, and cli-arguments.mjs:64 defaults the tree to the caller cwd RULE: A command wrapped in full-chain-lock names the tree it measures with --tree (for land.mjs, its --worktree); the guard refusal that suggests the wrapper carries that --tree, never the caller cwd. <!--fc:full-chain-lock-recorded-the-caller-cwd-as-tree#1-->
