# `detached-runner-died-without-a-verdict` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — Campaign run 20261111-164313231 printed 46/47 and its detached runner died with no verdict: rmSync of the chain TEMP threw because a process the chain left alive held a folder in it; fixed in 5ee21ce by recording the failure as verdict.tempLeft -> root cause: a cleanup step that can throw sat between the run and the verdict the runner promises on every path RULE: A runner that promises a verdict on every path writes it after any cleanup failure, recording what was left, and a selftest proves it with the cleanup forced to throw. <!--fc:detached-runner-died-without-a-verdict#1-->
