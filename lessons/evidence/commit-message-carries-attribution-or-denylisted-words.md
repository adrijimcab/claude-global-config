# `commit-message-carries-attribution-or-denylisted-words` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-06-09 — (×2) Commits carried Co-Authored-By / AI attribution; later the `commit-msg` denylist rejected a message TWICE because it matches `agent`/`agents` even INSIDE hyphenated words (`agent-contract` matches `(^|[^a-z])agents?([^a-z]|$)`) → RULE: a commit message is ONLY `type(scope): desc` with zero attribution, and files of that kind are described obliquely ("the two contract files", "the parity gate"); the denylist also covers claude/anthropic/copilot/chatgpt/openai, `cherry picked from`, `co-authored-by`, `generated with`.
