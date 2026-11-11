# `detached-campaign-expired-in-the-lock-queue` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-11 (captured)

- [global] 2026-11-11 — Four detached mutation campaigns (T31 x2, T17, T34) queued on 2026-11-10 behind b100 integrate pid 43280 with the default 3600 s wait; all four exited 75 at exactly one hour with nothing run, and the verdicts were read only the next morning -> root cause: the wait bound was the default, never derived from the holder's expected remaining time plus the queue ahead, and a detached chain has no waker once the session's background waiters are reaped RULE: A chain queued behind a holder gets --wait-seconds derived from the holder's measured duration plus the queue ahead of it, and every detached verdict is read with run.mjs --read at the next turn. <!--fc:detached-campaign-expired-in-the-lock-queue#1-->
