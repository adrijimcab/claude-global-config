# `review-agent-launched-without-its-tools` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-10 (captured)

- [global] 2026-11-10 — On 2026-11-10 (Discovery, ODD login-return-url) an independent security verifier was launched as agent type review-risk; that type expects the native review binding and context block and has no file or git tools, so it returned an incomplete inspection and no review -> root cause: the agent type was picked by its name (risk review) without reading its definition and tools RULE: Before launching an agent type, read its definition and tools; a read-only verifier outside the native review lifecycle is launched as general-purpose (or Explore), never as a review-* lens. <!--fc:review-agent-launched-without-its-tools#1-->
