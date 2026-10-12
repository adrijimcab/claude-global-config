# `guard-built-on-an-unmeasured-premise` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (captured)

- [global] 2026-10-12 — stale-session-guard warns that hook groups added to settings.json after session start do not run, but in this session the new SubagentStart group and the judge-gate Stop commands ran (probe agent received the pointer; 20 judge-gate outcomes from this session) -> root cause: the guard's premise came from a worker's reading of dispatch.mjs, never from a live probe of the harness RULE: A guard's premise about harness behaviour is measured with a live probe before the guard lands, and the probe is kept as its fixture. <!--fc:guard-built-on-an-unmeasured-premise#1-->
