# `mutating-sync-placed-in-pre-push` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-07-10 — Puse/heredé un sync MUTANTE (`docs:sync-counters`) en pre-push esperando que entre al push → los hooks pre-push corren post-commit, la mutación queda fuera de la historia → RULE: en pre-push usar mutate+abort-on-change o check-only; los syncs mutantes que deben entrar al commit van en pre-commit.
