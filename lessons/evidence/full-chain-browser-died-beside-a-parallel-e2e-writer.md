# `full-chain-browser-died-beside-a-parallel-e2e-writer` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-17 (captured)

- [global] 2026-11-17 — Discovery-FE build:ci on 2c3b7261 failed at test:lib: Karma "Cannot start ChromeHeadless", "failed 2 times (cannot start). Giving up", exit 1; the step re-run alone passed but its log shows "Executed 326 of 350 DISCONNECTED" before a full 350/350 (TOTAL 676), a second browser death in the same chain. Both happened while a delegated writer ran Playwright e2e in a worktree (8 chrome processes); free memory 41135 of 65253 MB, so not memory. HYPOTHESIS, not reproduced: browser contention between the full chain and a parallel e2e writer -> root cause still open RULE: A full chain (build:ci, build:ci-pr) does not run while any writer of the machine runs browsers (Playwright, Karma, Vitest browser); the orchestrator launches it only after those writers report, and a browser death inside a chain is re-run from the start with nothing beside it before it is read as a verdict. <!--fc:full-chain-browser-died-beside-a-parallel-e2e-writer#1-->
