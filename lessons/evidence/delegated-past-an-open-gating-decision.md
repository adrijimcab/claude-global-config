# `delegated-past-an-open-gating-decision` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-05 (captured)

- [global] 2026-11-05 — On 2026-11-04 the orchestrator launched three delegated writers (T25, T27, T29) although its own feature document master-green-carry.md row T20 decided "no delegated writers until T20 is live", because worker-temp-file-collided-across-sessions was at 4x and a brief instruction had already failed to stop it; it read the routing rules but not its own open decisions before launching. No shared-temp file from those workers was found afterwards (only an unrelated empty file created hours later) -> root cause: a gating decision written in a feature document is not checked by anything before an Agent launch RULE: Before any Agent launch, read the open STOP/gating rows of the active feature document; a decision that forbids delegation holds until its task lands, and the launch waits or runs inline. <!--fc:delegated-past-an-open-gating-decision#1-->
