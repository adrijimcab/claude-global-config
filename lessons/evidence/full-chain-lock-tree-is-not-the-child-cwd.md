# `full-chain-lock-tree-is-not-the-child-cwd` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — On 2026-11-15 a detached full-chain-lock run (20261115-063508575-ci-test) launched with --tree <angular-22-b worktree> ran gate-run ci:test in the MAIN checkout: its state dir was gate-run/state/b100-am-ui-d0f440e4c5ef, not the worktree one -> root cause: run.mjs --tree records the tree in the holder but does not set the child cwd, and gate-run grades its own cwd; caught in 25 s, killed, main checkout clean RULE: A chain launched through full-chain-lock runs from the directory it must grade (a child script that sets its location, or the tool own cwd option), and its first output line is read to confirm the graded tree before it is left to run. <!--fc:full-chain-lock-tree-is-not-the-child-cwd#1-->
