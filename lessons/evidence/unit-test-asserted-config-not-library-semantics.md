# `unit-test-asserted-config-not-library-semantics` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-11 (captured)

- [global] 2026-11-11 — Discovery-FE batch-chains-parity T1: to stop two columns sorting I removed sortable:true and the unit spec asserted sortable===true per column, which went green; the e2e showed the headers still sortable because b100-table isColumnSortable treats an omitted sortable as true when sortEnabled is on (b100-table.component.ts:388) -> root cause: the unit test asserted my reading of the config shape, not the value the consuming library reads RULE: A unit test of a configuration asserts the exact values the consumer reads, after reading the consumer's rule for them (defaults included), never a predicate that folds an omitted value into the expected one. <!--fc:unit-test-asserted-config-not-library-semantics#1-->
