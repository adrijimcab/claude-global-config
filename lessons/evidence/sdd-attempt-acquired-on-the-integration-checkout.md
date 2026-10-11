# `sdd-attempt-acquired-on-the-integration-checkout` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-11 (condensed)

- [global] 2026-10-11 — The native SDD attempt for login slice 1A was acquired with --cwd pointing at the MAIN checkout while the slice was applied in its own worktree; the runtime ledger measured the main worktree, so every integration landed on feature/meet during the attempt (translations, f8, f9) was charged to it: 9300 changed lines and changed_line_budget_exceeded, settle returned blocked(maintainer_decision) -> root cause: the attempt cwd must be the worktree where the work unit is applied, and nothing may be integrated into that tree during the attempt -> RULE: run `gentle-ai sdd-attempt acquire|settle` with --cwd set to the work unit's own worktree, never the integration checkout; and forecast a slice from its real diff (specs included) before acquiring, splitting it when a type change forces service and consumer into one commit above 400 lines. <!--fc:sdd-attempt-acquired-on-the-integration-checkout#3-->
