# `gitignored-deliverable-destroyed-by-worktree-autoclean` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

- **`gitignored-deliverable-destroyed-by-worktree-autoclean`** — CLOSED BY MECHANISM 2026-09-16; this
  entry states what the mechanism enforces. Two deliveries were lost because a worktree whose whole
  value sat in ignored paths read as EMPTY and was removed. ROOT, and it is one `.gitignore` rule
  serving two opposite populations: `dist/`, `node_modules/` and coverage are build product — never a
  deliverable, and counting them makes every consumer refuse forever — while `.claude/**` is this
  project's own hand-authored tooling, always a deliverable and invisible to `git status --porcelain`.
  `.claude/fleet-env/delivery.mjs:27` had written that blindness down as a deliberate decision.
  THE RULE, now a shared predicate rather than a habit: the question a removal decides is **"if this
  worktree were deleted right now, what would be gone for good?"**, and it is answered in ONE place
  (`.claude/worktree-work/worktree-work.mjs`) that every consumer asks — `fleet-env/delivery.mjs`,
  `integrate/worktree-closure.mjs`, `orphan-work-guard/guard.mjs`. **Anything ignored and UNDECLARED
  counts as work**: a path is exempt only where a declaration names the process that produces it, so a
  new ignored build directory shows up loudly and a new ignored tooling directory is protected for
  free. The two failure directions are not symmetric and the default points away from the silent one.
  Proof: 29/29 selftest on constructed repositories, 23/23 mutants killed against that green baseline,
  and eight consumer selftests re-run green. THE RESIDUAL GAP, stated rather than hidden: the Stop gate
  fires only when a worker CLAIMS completion, so a worker that stops without claiming is still not
  blocked, and the harness's own auto-clean is untouched.
  The half that generalises beyond worktrees: **a predicate inherited by many consumers carries its
  blind spot to all of them**, and the blind spot is invisible precisely because every consumer agrees.
  When a shared question keeps producing surprises, fix the question — never add a second answer beside
  it.


## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-16 — gitignored-deliverable-destroyed-by-worktree-autoclean: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism .claude/worktree-work/worktree-work.mjs (selftest run, exit 0); full incident history in .claude/failure-capture/state/incidents.jsonl <!--fc:gitignored-deliverable-destroyed-by-worktree-autoclean#1-->

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`gitignored-deliverable-destroyed-by-worktree-autoclean`** — CLOSED BY MECHANISM 2026-09-16. Two
  deliveries were lost because a worktree whose whole value sat in ignored paths read as EMPTY and was
  removed. ROOT: one `.gitignore` rule serves two opposite populations — `dist/`, `node_modules/` and
  coverage are build product and never a deliverable, while `.claude/**` is this project's own
  hand-authored tooling, always a deliverable and invisible to `git status --porcelain`.
  **THE RULE, a shared predicate rather than a habit:** the question a removal decides is "if this
  worktree were deleted right now, what would be gone for good?", answered in ONE place
  (`.claude/worktree-work/worktree-work.mjs`) that every consumer asks. **Anything ignored and
  UNDECLARED counts as work** — a path is exempt only where a declaration names the process that
  produces it. Proof: 29/29 selftest, 23/23 mutants killed. RESIDUAL GAP: the Stop gate fires only
  when a worker CLAIMS completion, so a worker that stops without claiming is still not blocked, and
  the harness's own auto-clean is untouched. Generalizes beyond worktrees: a predicate inherited by
  many consumers carries its blind spot to all of them — when a shared question keeps producing
  surprises, fix the question, never add a second answer beside it.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/gitignored-deliverable-destroyed-by-worktree-autoclean.md`.
````
