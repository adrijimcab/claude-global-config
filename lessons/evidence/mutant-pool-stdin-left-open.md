# `mutant-pool-stdin-left-open` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-04 (captured)

- [global] 2026-11-04 — On 2026-11-04 the judge-gate campaign at 721e83b had one survivor, "importing the CLI runs it", killed by SIGTERM: the mutated selftest reads stdin, which the pooled child got as an open pipe never ended (mutant-pool.mjs spawn without stdio), while the baseline spawnSync gives EOF at once; measured: stdin closed, exit 1 in 759 ms; stdin open, still running after 60 s -> root cause: the pool and the baseline differ in stdin, a second parity defect of the same family as mutant-pool-temp-inside-a-git-tree; the b100 session fixes it at its source as T14 RULE: A runner gives a pooled child the same stdio as its serial baseline (stdin ignored or ended at once), and a near-miss selftest that reads stdin proves the pooled run ends. <!--fc:mutant-pool-stdin-left-open#1-->
