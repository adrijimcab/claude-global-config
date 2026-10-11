# `landing-order-ignored-the-owners-priority` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-11 (condensed)

- [global] 2026-10-11 — The voice judge the owner asked for was finished and verified but left out of a landing that carried the noisier backlog-guard fix, so no session ran it while the owner kept seeing dry replies (owner: «ya se integró en master lo de la voz?»; engram #1428) -> root cause: landings were ordered by noise volume, and a mergeable settings.json overlap with an unfinished branch was treated as a blocker -> RULE: land in the order of the owner's latest explicit priority unless a MEASURED dependency forbids it; a resolvable merge with an unfinished branch is not a dependency. <!--fc:landing-order-ignored-the-owners-priority#1-->
