# `instructed-a-worker-to-run-a-denied-command` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-30 — instructed-a-worker-to-run-a-denied-command: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/brief-feasibility/guard.mjs (selftest run, exit 0); full incident history in .claude/failure-capture/state/incidents.jsonl <!--fc:instructed-a-worker-to-run-a-denied-command#3-->

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`instructed-a-worker-to-run-a-denied-command`** — A brief is written from the operation I want,
  and the worker's environment decides what it can actually do. Twice: a brief told a worker to
  `git rebase` (denied in settings), and a brief told an `isolation: "worktree"` worker to create a
  new worktree and move into it, which made the worktree-isolation guard refuse every later shell
  call and left the worker without Bash for the rest of its session. RULE: before any command goes
  into a brief, check it against the worker's real environment (deny list, blocking hooks, its pinned
  worktree) and name the alternative that works. A worker never changes worktree: moving work onto a
  new base is the orchestrator's step (cherry-pick into the new worktree from the main checkout),
  followed by a worker whose TENANCY names that worktree from launch. THIRD FACE (2026-09-30): briefs
  told worktree workers to run `node .claude/diff-coverage/…` by a RELATIVE path; `.claude/` tooling is
  gitignored and lives only in the main checkout, so the worker could not self-verify. Every tooling
  command in a brief uses the main checkout's ABSOLUTE path. Mechanism: `~/.claude/brief-feasibility/`.
````

## Ledger line archived 2026-10-02 (promoted)

- [promoted] 2026-09-30 — instructed-a-worker-to-run-a-denied-command: mechanism C:/Users/adrian.jimenez/.claude/brief-feasibility/guard.mjs <!--fc:instructed-a-worker-to-run-a-denied-command#4-->

Promoted 2026-10-02 to ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/brief-feasibility/guard.mjs (selftest run, exit 0)
