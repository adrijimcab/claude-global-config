# `changed-file-own-spec-left-out-of-scoped-run` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-11 (captured)

- [global] 2026-11-11 — Discovery-FE 58b96aaa added data.headerSearch to the batchJobs route in app.routes.ts; my scoped proof ran the facade, page and e2e specs but not app.routes.spec.ts, which pins the closed set of searchable pages, so build:ci went red on test:app (1 of 5909) -> root cause: the scoped spec list was chosen by feature folder, not by which specs import the changed files RULE: The scoped proof of a change runs every spec that imports a changed file (vitest --related or a grep of imports), not only the specs of the feature folder. <!--fc:changed-file-own-spec-left-out-of-scoped-run#1-->
