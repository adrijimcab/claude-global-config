# `known-side-effect-left-out-of-shared-brief` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-04 (condensed)

- [global] 2026-10-01 — Round 2 told workers PROD reads were safe; worker a1 ran GET /api/insightDataField/<p>/ which deleted 531 docs (local Mongo) and crashed PROD -> root cause: the read-path write was already measured in round 1 (a4: insightDataField first call creates/builds the collection) but I put the warning only into r3's brief, not into the shared round-2 addendum every worker reads, and I authorised 'read-only requests' without listing which GETs are not read-only -> RULE: any measured side effect of a target system goes into the SHARED brief section every worker reads, as an explicit denylist of endpoints, the same turn it is measured; 'read-only' is never assumed from the HTTP verb of a legacy system. <!--fc:known-side-effect-left-out-of-shared-brief#1-->
