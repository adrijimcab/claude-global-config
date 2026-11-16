# `suspended-child-left-by-a-tree-kill-mid-spawn` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — A probe holder from mutant 12940 of campaign run 20261111-212457797 was found 3.5 days later suspended (0 CPU seconds, one thread Wait/Suspended), an orphan whose parent was gone; neither its ceiling nor its owner watch could run (HYPOTHESIS: the mutant pool ended the selftest tree while the orphan maker was spawning, leaving a child created but never resumed) -> root cause: a tree kill cannot reach a child created mid-spawn, and nothing swept by the sandbox path RULE: After ending a mutant selftest tree, the mutation engine also ends every process whose command line names that mutant sandbox, because a child left suspended mid-spawn runs no code of its own. <!--fc:suspended-child-left-by-a-tree-kill-mid-spawn#1-->
