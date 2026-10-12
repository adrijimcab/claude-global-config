# `removal-chained-after-an-unconfirmed-check` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (condensed)

- [global] 2026-10-12 — A worktree and branch removal ran although the content check before it had not confirmed (diff --quiet exited non-zero), because the removal was chained with ';' instead of '&&' -> root cause: a destructive step not gated on the check's exit -> RULE: a removal is chained with && on the check that justifies it, or runs in its own call after the check's result is read <!--fc:removal-chained-after-an-unconfirmed-check#1-->
