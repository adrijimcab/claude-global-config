# `engram-writes-refused-after-session-resume` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-14 (captured)

- [global] 2026-10-14 — On 2026-10-14, after the session was resumed, every engram write (mem_update, mem_session_start) was refused by the engram plugin PreToolUse hook (engram hook claude-pre-tool-use, plugin 0.1.7) with: Claude host session already ended; an earlier mem_session_summary in the same session after the first resume had succeeded. HYPOTHESIS, not reproduced: the plugin SessionEnd hook marks the session ended (POST /sessions/<id>/end) and the resume SessionStart (POST /sessions) does not reopen an ended id, so a resumed session loses engram writes for the rest of its life. RULE: After any session resume, probe one engram write before relying on engram; when it is refused, keep the record in file memory, tell the owner, and move it to engram from a fresh session. <!--fc:engram-writes-refused-after-session-resume#1-->
