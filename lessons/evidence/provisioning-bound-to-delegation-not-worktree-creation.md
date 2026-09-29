# `provisioning-bound-to-delegation-not-worktree-creation` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

- **`provisioning-bound-to-delegation-not-worktree-creation`** — A worktree you create YOURSELF arrives
  with no `node_modules`, because the provisioner is bound to DELEGATION — a `PreToolUse` hook on
  `Task|Agent` — and never to worktree creation. It fires for a spawned worker and never for a worktree
  you make by hand. Measured, twice: the second time I made one to land a change the integration guard
  had correctly refused on `develop`, and nothing could run in it. The reason it recurred is the part
  worth keeping: **the refusal message that sends you down that path was itself telling me the
  opposite**, printing `git worktree add … # node_modules is junctioned for you` — guidance TRUE for a
  delegated worker and FALSE for anyone following the printed instruction by hand, with nothing in the
  text distinguishing the two. A correct instruction whose audience is ambiguous is a wrong instruction
  for half its readers. (Corrected in `.husky/pre-commit`, without naming the gitignored provisioner,
  since no agent tooling may enter git.)
  **RULE: after any `git worktree add` you performed yourself, give the new worktree its dependencies
  BEFORE running a single gate there** — and never read a gate failure in a fresh worktree as a verdict
  about the code until `node_modules` is confirmed present. The first failure in a new worktree is
  almost always the missing install, and it will masquerade as anything: a type error, a broken import,
  a red gate that has nothing to do with your change.

