# `vendored-copy-edited-in-place` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-18 (condensed)

- [global] 2026-10-12 — A worker in a ~/.claude worktree edited the vendored brief-tenancy/tenancy-declaration.mjs (efff857) and it landed on master through checkpoint-37; vendored check now reports EDITED IN THE KIT -> root cause: vendored-edit-guard judges writes to the live ~/.claude paths, so an edit inside a linked worktree of ~/.claude passes, and the landing does not run vendored check -> RULE: a vendored module changes only at its b100 source followed by vendored sync; the landing of ~/.claude runs vendored check and refuses EDITED IN THE KIT <!--fc:vendored-copy-edited-in-place#1-->

## Ledger line archived 2026-11-10 (promoted)

- [guards] 2026-10-12 — RULE: a vendored module changes only at its b100 source followed by vendored sync; the landing of ~/.claude runs vendored check and refuses EDITED IN THE KIT Evidence: lessons/evidence/vendored-copy-edited-in-place.md <!--fc:vendored-copy-edited-in-place#1-->

Promoted 2026-11-10 to ~/.claude/rules/promoted-guards.md; closed by mechanism C:/Users/adrian.jimenez/.claude/vendored-edit-guard/guard.mjs (selftest run, exit 0)
