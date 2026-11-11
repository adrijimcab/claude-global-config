# `test-assumed-the-caller-environment` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-11 (captured)

- [global] 2026-11-11 — runner.selftest.mjs asserted the child env lacks FULL_CHAIN_LOCK_TOKEN; once the selftest ran under the token-handing lock the caller carried a token and the check went red 145/146 (run 20261111-114941039), fixed in b74b0c6 by comparing with the caller's real environment -> root cause: the test pinned a property of the environment it happened to run in instead of the adapter's behaviour RULE: A test about what a process inherits compares with the caller's real environment, never with an assumed one, and is proved both with and without the variable set. <!--fc:test-assumed-the-caller-environment#1-->
