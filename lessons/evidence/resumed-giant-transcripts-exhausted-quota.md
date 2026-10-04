# `resumed-giant-transcripts-exhausted-quota` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-04 (condensed)

- [global] 2026-10-01 — Workers stopped three times on usage limits (weekly, session 11:20, session 16:20); the last time six agents died within minutes -> root cause: I kept RESUMING agents whose transcripts were 5-7 MB (500-900k tokens), so every step re-sent the whole transcript, and ran six in parallel; the work state was in the documents on disk, not in those transcripts -> RULE: once a worker's transcript passes ~2 MB, do not resume it: launch a fresh agent with a narrow scope (3-5 screens) that reads the state from the files; cap concurrency at three; each agent writes its own part file incrementally so a stop loses nothing. <!--fc:resumed-giant-transcripts-exhausted-quota#1-->
