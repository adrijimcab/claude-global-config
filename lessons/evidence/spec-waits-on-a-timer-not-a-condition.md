# `spec-waits-on-a-timer-not-a-condition` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-26 (captured)

- [global] 2026-10-26 — The landing of the auth-port unit on Discovery develop failed once on InsightStructureService (typed text/json): the spec waited for an asynchronous Blob read with setTimeout(resolve, 20), and under load the read took longer, so the assertion ran first. A grep found 12 more fixed timer waits in specs. -> root cause: workers wrote specs that sleep instead of awaiting the decision of the code under test, and no gate refuses a timer wait in a spec RULE: A spec awaits the condition it depends on (the observable decision as a Promise, whenStable, a harness wait, fakeAsync with tick for owned timers), never a setTimeout; a lint rule that refuses setTimeout-based waits in spec files is the mechanism. <!--fc:spec-waits-on-a-timer-not-a-condition#1-->
