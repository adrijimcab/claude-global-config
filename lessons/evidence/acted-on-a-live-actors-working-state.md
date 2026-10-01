# `acted-on-a-live-actors-working-state` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-30 — acted-on-a-live-actors-working-state: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/commit-pathspec-guard/guard.mjs (selftest run, exit 0); full incident history in ~/.claude/failure-capture/state/incidents.jsonl <!--fc:acted-on-a-live-actors-working-state#2-->

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`acted-on-a-live-actors-working-state`** — Acting on shared repository state — a worktree, an index —
  before establishing that no OTHER actor's work is mixed into it. Two faces recorded to date:
  - **A LIVE ACTOR'S WORKING TREE COMMITTED MID-RUN (2026-09-09).** I committed a LIVE agent's working
    tree while it was mid-run and captured a state it then corrected; real, load-bearing corrections
    the agent found afterwards were lost in the snapshot I had already landed. RULE: before committing,
    reaping, rebasing or otherwise acting on ANY worktree that is not mine, establish that its actor has
    STOPPED from the agent list, never from how finished the diff looks.
  - **THE SHARED INDEX SWEPT INTO MY COMMIT (2026-09-30).** In the `b100-am-ui-claude-tooling` backup
    repo I ran `git add AGENT-LEDGER.md` then `git commit`, and the bare commit swept in 63 deletions a
    different, FROZEN actor had already staged in that same shared index — `git add <path>` only ADDS,
    it never NARROWS what a bare `commit` then sweeps up — and the merged commit was pushed before
    anyone read the diff. RULE: commit with an explicit pathspec (`-- <paths>`, or `--only <paths>`) in
    ANY repo another actor may have touched, never a bare `commit` that sweeps the whole shared index.
    CLOSED BY MECHANISM: `~/.claude/commit-pathspec-guard/guard.mjs` (selftest and mutation-proof run,
    both green).
````
