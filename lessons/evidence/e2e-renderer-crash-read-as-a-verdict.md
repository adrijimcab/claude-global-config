# `e2e-renderer-crash-read-as-a-verdict` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — batch-chains-parity T5: one Chromium run reported "locator.click: Target crashed" in chain-executions-toolbar, not an assertion; re-run with --repeat-each=3 gave 16 passed and 44 GB free (backlog 622) -> root cause: a renderer crash is an environment event, and reading it as a red would have sent a fix after a non-defect RULE: A Playwright failure whose error is "Target crashed" (or another browser-process death) is re-run with --repeat-each and a memory sample before it is read as a verdict about the code, and both outputs are reported. <!--fc:e2e-renderer-crash-read-as-a-verdict#1-->
