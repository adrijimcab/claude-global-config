# `owner-decision-reopened-as-pending` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-27 (captured)

- [global] 2026-10-27 — On 2026-10-26 backlog item 554 opened the SonarQube token rotation as a pending owner decision, and on 2026-10-27 I reported it to the owner three times as the most urgent open item, although the owner had already decided it on 2026-10-25 (ODD back-develop-alignment S4: «Lo de rotar el token no te preocupes es un entorno seguro», recorded in backlog part 41 #1872 as "sonar.token rotation dropped (safe environment)") -> root cause: an open item was written and later relayed from the item text alone, without searching the earlier records for an owner decision on the same subject; the reconciliation (586) read only parts 42-44. RULE: Before an item is written or relayed as a pending owner decision, search every record of the project (engram export or mem_search on the subject) for an earlier owner decision on it, and cite that decision or the empty search. <!--fc:owner-decision-reopened-as-pending#1-->

## Ledger line archived 2026-11-04 (captured)

- [global] 2026-11-04 — Restored ledger line, originally captured 2026-10-27: the 2026-11-04 master landing (99ac083) reset the live ledger to the landed tree, which did not hold this capture -> root cause: capture output written to the live ledger after the branch point was replayed after alignment instead of carried into the branch before landing RULE: Before an item is written or relayed as a pending owner decision, search every record of the project (engram export or mem_search on the subject) for an earlier owner decision on it, and cite that decision or the empty search. <!--fc:owner-decision-reopened-as-pending#1-->
