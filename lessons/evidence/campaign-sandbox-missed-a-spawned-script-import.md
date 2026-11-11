# `campaign-sandbox-missed-a-spawned-script-import` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-11 (captured)

- [global] 2026-11-11 — T17's session-processes campaign was NOT MEASURED (baseline 57/60 in the sandbox, 60/60 in the worktree): its selftest spawns full-chain-lock/run.mjs, whose messages.mjs imports ../bilingual-output/speaker.mjs, and bilingual-output was not in the campaign paths; reproduced red in a hand-made sandbox copy and green with the folder, fixed in 0c7c9ac -> root cause: the engine's import-closure check follows static imports only, so a script the selftest spawns brings imports nobody listed RULE: A selftest that spawns a script names that script's whole import closure in its campaign paths, and its baseline is proved green in a sandbox copy before the campaign is queued. <!--fc:campaign-sandbox-missed-a-spawned-script-import#1-->
