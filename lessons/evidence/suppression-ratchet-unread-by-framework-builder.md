# `suppression-ratchet-unread-by-framework-builder` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-07-20 — Added an ESLint rule + baselined existing violations into the NATIVE bulk-suppressions file (`eslint-suppressions.json` via `eslint --suppress-rule`), but the project's lint runner was `ng lint` (@angular-eslint builder), which does NOT load that file → the whole baseline surfaced as errors (green→red) and reached origin; agents that only linted CHANGED files saw green and missed it. Root cause: native bulk suppressions are consumed only by the ESLint CLI, not framework builders. → RULE: when introducing a lint rule backed by a native suppressions ratchet, VERIFY the project's actual lint command loads the suppressions file (`npx eslint <baselined-file>` exit 0 vs the project runner); if the runner is `ng lint`/a framework builder, switch lint to the ESLint CLI with the flat config (parity-verified) or the ratchet is a silent no-op.
