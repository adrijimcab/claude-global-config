# `derived-artifact-regenerated-only-when-absent` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-07-20 — A "generate-if-missing" guard (regenerate a gitignored derived file only when ABSENT, keyed on existsSync) served a STALE artifact after the generator's OUTPUT SHAPE changed (added a new exported type) → typecheck/consumers broke on every existing checkout; CI hid it because CI regenerates fresh each job. → RULE: guards for derived/generated artifacts must detect STALENESS via a content fingerprint of the generator's INPUTS (regenerate when inputs change), never presence-only and never mtime (unreliable across checkouts).
