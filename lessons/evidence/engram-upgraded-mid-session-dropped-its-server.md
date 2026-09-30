# `engram-upgraded-mid-session-dropped-its-server` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-06-16 — Ran `gentle-ai upgrade` (engram 1.16.1→1.16.3) mid-session and the engram MCP server disconnected, making all `mem_*` tools unavailable → upgrading a binary whose MCP server is running kills that connection → RULE: upgrade engram at session start/end, not mid-work; if upgraded mid-session, expect mem_* to drop and fall back to file memory until restart.
