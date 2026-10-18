# `engram-writes-refused-after-session-resume` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-14 (captured)

- [global] 2026-10-14 — On 2026-10-14, after the session was resumed, every engram write (mem_update, mem_session_start) was refused by the engram plugin PreToolUse hook (engram hook claude-pre-tool-use, plugin 0.1.7) with: Claude host session already ended; an earlier mem_session_summary in the same session after the first resume had succeeded. HYPOTHESIS, not reproduced: the plugin SessionEnd hook marks the session ended (POST /sessions/<id>/end) and the resume SessionStart (POST /sessions) does not reopen an ended id, so a resumed session loses engram writes for the rest of its life. RULE: After any session resume, probe one engram write before relying on engram; when it is refused, keep the record in file memory, tell the owner, and move it to engram from a fresh session. <!--fc:engram-writes-refused-after-session-resume#1-->

## Ledger line archived 2026-10-18 (promoted)

- [global] 2026-10-14 — RULE: After any session resume, probe one engram write before relying on engram; when it is refused, keep the record in file memory, tell the owner, and move it to engram from a fresh session. Evidence: lessons/evidence/engram-writes-refused-after-session-resume.md <!--fc:engram-writes-refused-after-session-resume#2-->

Promoted 2026-10-18 to ~/.claude/rules/promoted-rules.md; no mechanism is possible: The refusal is decided inside the engram binary: its server exposes only POST /sessions/{id}/end and no route to reopen an ended session (measured in engram 3.4.0), and a resumed session is not always refused, so no hook on our side can prevent it or predict it without a state endpoint; the promoted rule carries the probe-first behaviour and the root fix belongs upstream in engram. @es La negativa la decide el binario de engram: su servidor solo expone POST /sessions/{id}/end y ninguna ruta para reabrir una sesión terminada (medido en engram 3.4.0), y una sesión reanudada no siempre queda rechazada, así que ningún hook nuestro puede impedirlo ni preverlo sin un endpoint de estado; la regla promovida lleva la conducta de sondear primero y el arreglo de raíz corresponde a engram.
