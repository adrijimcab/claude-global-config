# `landing-gate-run-on-a-tree-that-cannot-fast-forward` — full evidence / evidencia completa

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`landing-gate-run-on-a-tree-that-cannot-fast-forward`** — A landing-proof gate run (the whole gate
  chain invoked with no arguments, or the unit-suite floor `ci:test`) must REFUSE before a single gate
  starts, and before any verdict is written as `running`, when its tree cannot fast-forward the
  integration branch it means to prove — a green run there still has to be reproven at landing time, for
  nothing. MEASURED 2026-09-30 (b100-am-ui): an integrator branched from `ae6dbdf0` while `develop` had
  already moved to `badfdead` (a counters commit), ran a full `ci:test` through `gate-run.mjs` on that
  stale tree, and only at LANDING TIME did `git merge --ff-only` prove impossible — after the whole unit
  suite had already run for nothing. The run was stopped and redone on a rebuilt branch
  (`integrate/batch-3`), costing about twelve minutes plus a rerun. ROOT CAUSE: an integration branch
  named in a brief is an INSTRUCTION, never a PRECONDITION a tool enforces, and it rots the moment the
  integration branch moves again. RULE: before any landing-proof gate run starts, ask git directly —
  `git merge-base --is-ancestor <integration branch> HEAD` — never trust a base named in a brief or
  remembered from an earlier turn. Where no automated gate-run capability exists yet, an orchestrator or
  worker runs that exact `merge-base --is-ancestor` check by hand before starting any landing-proof run,
  and rebuilds with `git switch -c <new-branch> <integration branch>` + `git cherry-pick <base>..<old-ref>`
  when it fails — never `git rebase`, which is denied in every b100-am-ui shell. CLOSED BY MECHANISM
  (b100-am-ui only, so far — this is the first occurrence, promoted early because the mechanism was
  already built rather than waiting for a second incident):
  `.claude/gate-run/landing-precondition.mjs`, asked at the top of `gate-run.mjs`'s `gate()` before
  `claimWorktree`/`openVerdict` run, reusing the SAME two constants (`CHAIN_SCRIPT`, `UNIT_SUITE_SCRIPT`)
  `.claude/ungated-landing-guard/` already grades a landing against, rather than a second, invented
  definition. Selftest `.claude/gate-run/landing-precondition.selftest.mjs` 37/37 over constructed temp
  git repositories (never a real branch); mutants `.claude/gate-run/landing-precondition.mutants.mjs`
  14/14 killed, including the one line wired into `gate-run.mjs` itself, proven through the real exported
  `main`, not a reimplementation. Full incident: `.claude/lessons-ledger.md` (b100-am-ui) under this key.
  Evidencia completa (incidente medido, literal): `~/.claude/lessons/evidence/worker-overwrote-master-backlog.md`.
````
