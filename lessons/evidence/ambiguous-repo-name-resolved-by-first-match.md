# `ambiguous-repo-name-resolved-by-first-match` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-09-30 — Owner asked for a CLAUDE.md in "discovery-api"; I picked C:/Users/.../Projects/discovery-api by folder NAME among the Projects/ entries and delegated work there, while the owner meant insight_web - copia/di_1700002_insight_web/fuentes/discovery-api (the legacy Express backend; the one I picked is its NestJS migration, same remote) -> root cause: I resolved an ambiguous repo name by the first plausible match and never asked or enumerated candidates, even though the remote name (insight_web) already signalled the name did not match -> RULE: when a request names a repo or folder, enumerate every checkout that could match (name, remote, nested subfolders) and confirm with the owner in one question before delegating any work to it. <!--fc:ambiguous-repo-name-resolved-by-first-match#1-->
