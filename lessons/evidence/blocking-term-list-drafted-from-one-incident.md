# `blocking-term-list-drafted-from-one-incident` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-11 (condensed)

- [global] 2026-10-11 — The orchestrator wrote the no-AI-on-company-remotes rule with "spec-driven" in its term list; session b100-am-ui-f8's census found it blocking plain English ("pure and spec-driven" in scripts/check-undocumented-api/analyze.ts:18) -> root cause: the list was drafted from the words of one incident (an openspec ignore comment) instead of from what the rule protects (tool names) -> RULE: a denylist names what it forbids, never a generic phrase; before a term enters a blocking list, grep the real trees it will gate and read every hit. Fixed on land/checkpoint-5 c2b0cac. <!--fc:blocking-term-list-drafted-from-one-incident#1-->
