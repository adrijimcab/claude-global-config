# `observer-altered-observed-gate` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (condensed)

- [global] 2026-10-12 — A b100 worker building the path-to-gates deriver registered module.registerHooks next to `--import jiti/register` to observe each gate's file reads, and check:i18n-provenance then failed only under observation -> root cause: the observing hook changed module loading for the gate it measured, so the record described an altered gate, not the real one -> RULE: an observer must not change what it observes; a gate that goes red only under observation invalidates its record (b100 gate-scope now refuses such a record), and the fix removes the interfering hook rather than excusing the gate. <!--fc:observer-altered-observed-gate#1-->
