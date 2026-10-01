# `contract-doc-names-a-mechanism-nobody-verifies` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-09-02 — My own always-injected CLAUDE.md described the agent-contract parity gate as '.husky/pre-commit runs node scripts/check-agent-contract-parity.mjs (tracked)'. Measured: that file does not exist, pre-commit never references it, and the real gate is .claude/agent-contract/parity.mjs fired at DELEGATION time by settings.local.json. I ran the documented command and it crashed; only then did I find the real one. Root cause: a memory/contract document names paths, hooks and wiring, and NOTHING verifies those claims are still true -- the same defect class as comment rot (task #120), applied to the documents that steer every session. Prose describing a MECHANISM decays exactly like prose describing code, and an always-injected file decays invisibly because it is read as authority rather than as a claim. RULE: a path, script name, hook, or wiring quoted from a memory or contract document is a HYPOTHESIS until the filesystem confirms it -- check before quoting it to a worker or to the user, and when it turns out to have moved, fix the document in the same turn rather than only working around it. <!--fc:contract-doc-names-a-mechanism-nobody-verifies#1-->

## Ledger line archived 2026-10-01 (promoted)

- [global] 2026-09-02 — RULE: a path, script name, hook, or wiring quoted from a memory or contract document is a HYPOTHESIS until the filesystem confirms it -- check before quoting it to a worker or to the user, and when it turns out to have moved, fix the document in the same turn rather than only working around it. Evidence: lessons/evidence/contract-doc-names-a-mechanism-nobody-verifies.md <!--fc:contract-doc-names-a-mechanism-nobody-verifies#1-->

Promoted 2026-10-01 to ~/.claude/rules/promoted-rules.md; closed by mechanism ~/.claude/contract-path-check/check.mjs (selftest run, exit 0)
