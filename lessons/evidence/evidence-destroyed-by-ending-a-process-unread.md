# `evidence-destroyed-by-ending-a-process-unread` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — Three probe holders alive 3.5 h past their 10-minute ceiling were ended with taskkill before their command lines and thread states were saved, so the cause stayed open until a fourth one was found suspended (0 CPU seconds, one thread Wait/Suspended) -> root cause: the process was ended before it was read RULE: Before ending a stray process, save its full command line, start time, parent chain and thread states to a file, then end it. <!--fc:evidence-destroyed-by-ending-a-process-unread#1-->
