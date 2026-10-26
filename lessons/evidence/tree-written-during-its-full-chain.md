# `tree-written-during-its-full-chain` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-26 (captured)

- [global] 2026-10-26 — On 2026-10-26 I launched the ~/.claude full selftest runner in the background on land-backlog-1-6 and then, in the same turn, edited and committed checklists/master-backlog.md there and wrote a script under TEMP/claude. Three selftests went red only because their sandbox detector saw those writes (brief-feasibility, commit-index-guard, foreign-delete-guard); the re-run with no writes showed which reds were real -> root cause: I treated a background chain as finished work and kept writing the tree and temp root it measures RULE: while a full chain runs in the background, write nothing in the tree under test or in TEMP/claude; queue those edits until its verdict is read. <!--fc:tree-written-during-its-full-chain#1-->
