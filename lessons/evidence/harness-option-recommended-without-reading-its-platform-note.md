# `harness-option-recommended-without-reading-its-platform-note` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-05 (captured)

- [global] 2026-11-05 — b100-am-ui 2026-11-05: after a background landing was reaped for low memory, I recommended to the owner, twice, to restart Claude Code with CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1, taking the variable name from the reap notice; the docs (code.claude.com/docs/en/env-vars) say "Windows has no memory-pressure signal, so this variable has no effect there", and the machine is Windows; another session caught it -> root cause: a harness option was recommended from its name in a notice, without reading its documented behaviour for the platform in use RULE: Before recommending a harness or tool option to the owner, read its documented behaviour for the platform in use and cite it; an option named in a notice is a lead, not a remedy. <!--fc:harness-option-recommended-without-reading-its-platform-note#1-->
