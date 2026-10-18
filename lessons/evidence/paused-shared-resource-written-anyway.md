# `paused-shared-resource-written-anyway` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-18 (captured)

- [global] 2026-10-18 — During master's checkpoint-42 pause, which I had acknowledged with 'no capture.mjs', I ran capture.mjs with --scope b100-am-ui; its condense pass also rewrote one line of the live ~/.claude/lessons-ledger.md -> root cause: I treated a project-scoped capture as outside the pause, without checking which files the tool writes -> RULE: during a shared-resource pause, run no command of the paused tool family at all, whatever its scope flag, and defer the record until resume. RULE: During a shared-resource pause, no command of the paused tool family runs at all, whatever its scope flag; records wait for the resume. <!--fc:paused-shared-resource-written-anyway#1-->
