# `orchestrator-cwd-change-leaked-to-workers` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (promoted)

- [global] 2026-09-30 — A live worker (a595e4b34a58b8c1d) received unprompted Environment update notices moving its Bash cwd to agent-aa3437bf9bf7832a9 and then to the main checkout, the exact sequence of cd commands I ran in my own Bash tool; it verified no damage and re-anchored with explicit cd. Root cause: the orchestrator changed its session cwd with cd inside Bash calls, and that cwd change propagated as a session-level environment update to other actors -> RULE: the orchestrator never uses cd in a Bash call; every command runs with absolute paths or git -C <path>, and a background command that needs a cwd sets it inside a spawned script, never through the session shell. <!--fc:orchestrator-cwd-change-leaked-to-workers#2-->

Promoted 2026-10-01 to ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/cwd-change-guard/guard.mjs (selftest run, exit 0)
