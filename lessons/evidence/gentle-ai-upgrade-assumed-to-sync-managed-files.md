# `gentle-ai-upgrade-assumed-to-sync-managed-files` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-06-16 — Assumed updating the gentle-ai binary delivered the new subagents → binary upgrade does NOT sync managed files (agents/CLAUDE.md/skills stayed Jun 9-11 while binary was 1.40.2) → RULE: after `gentle-ai upgrade`/update, run `gentle-ai sync`; verify file dates in ~/.claude/agents before assuming new agents/skills are active.
