# `lock-token-bootstrap-landed-through-the-old-wrapper` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-11 (captured)

- [global] 2026-11-11 — The T31 landing (lock token) was launched through master run.mjs, which hands no FULL_CHAIN_LOCK_TOKEN, so land.mjs ran the branch selftest-runner and it refused (verification-not-measured, run 20261111-114801448) -> root cause: a change to the wrapper that verifies was verified by the wrapper it replaces RULE: A change to the tool that wraps or verifies a landing is landed through its own branch version of that tool, after checking the shared state format is unchanged. <!--fc:lock-token-bootstrap-landed-through-the-old-wrapper#1-->
