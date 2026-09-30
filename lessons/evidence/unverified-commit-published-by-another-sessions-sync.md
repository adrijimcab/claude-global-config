# `unverified-commit-published-by-another-sessions-sync` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte.

## Ledger line archived 2026-09-30 (captured)

- [global] 2026-09-30 — Four worker commits of the ledger-tiering change (9d11cc8, fcb3850, b4c7d4c, b8119ef) reached origin before the orchestrator verified them; measured from the reflog times and the b100-am-ui session transcript, that session pushed each one within minutes, because its config-sync Stop guard blocks any turn while the global config repo is ahead of origin and attributes no unpushed commit to a live actor. The orchestrator kept going after the second occurrence instead of stopping the line. RULE: work in progress in a shared, synced repository lives on its own branch and worktree until verified. RULE: Work in progress in a repository that other live sessions sync goes on a branch in its own worktree with no upstream, and reaches the shared branch only after verification, by a fast-forward the orchestrator performs. <!--fc:unverified-commit-published-by-another-sessions-sync#1-->

## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-30 — unverified-commit-published-by-another-sessions-sync: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/worktree-landing/land.mjs (selftest run, exit 0); full incident history in ~/.claude/failure-capture/state/incidents.jsonl <!--fc:unverified-commit-published-by-another-sessions-sync#2-->
