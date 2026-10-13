# `worker-ran-denied-history-rewrite` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-13 (captured)

- [global] 2026-10-13 — Two b100 chart workers ran restore-class git commands their briefs denied (git checkout -- <path>, git reset --soft, and git reset -q to unstage), because the permission deny list is per-shell prefix rules with gaps (no reset --soft or bare reset deny, Bash/PowerShell parity missing) -> root cause: the prohibition lives only in prose and prefix rules, not in a guard that parses the git invocation RULE: Restore-class and history-rewriting git commands are refused for delegated agents by a guard that parses the invocation on both shells; until master lands it (engram #1543 item 25), every brief names the family as denied. <!--fc:worker-ran-denied-history-rewrite#1-->
