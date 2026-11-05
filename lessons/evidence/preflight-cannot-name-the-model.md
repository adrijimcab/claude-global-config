# `preflight-cannot-name-the-model` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-04 (captured)

- [global] 2026-11-04 — On 2026-11-04 node ~/.claude/brief-feasibility/preflight.mjs refused all three T25/T27/T29 briefs with only "AGENT-MODEL REFUSED ... the call names no model": its flags (preflight.mjs:53-58: --tool, --description, --isolation, --to, --cwd) have no --model, so the payload it builds can never name one and every Agent preflight is red whatever the brief says -> root cause: the agent-model guard was added to the delegation manifest without extending the preflight that replays that manifest RULE: A guard added to a hook manifest ships with the preflight input it needs (here a --model flag), and the preflight selftest proves a well-formed brief passes the whole manifest. <!--fc:preflight-cannot-name-the-model#1-->
