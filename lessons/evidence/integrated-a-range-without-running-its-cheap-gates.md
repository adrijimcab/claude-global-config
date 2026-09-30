# `integrated-a-range-without-running-its-cheap-gates` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

- **`integrated-a-range-without-running-its-cheap-gates`** — Every integration onto `develop` runs every
  gate that can READ the changed paths, never a gate list I chose. Measured, four times: 4703f612 was
  picked with no gates (format:check red); 56f26512 got prettier and eslint only (32
  `ensure-demo-generated` specs red); fbe3f398 got its own specs plus `check:ci-scripts`
  (`check:i18n-provenance` red, because a `docs/SCRIPTS.md` description changed); 3d42c263 left
  `check:provenance-coverage` red. Each time my selection was plausible and each time it missed a gate
  that reads the touched files INDIRECTLY: a sidecar, a spec fixture, a derived policy. **A hand-picked
  gate set is a bounded search written down as coverage.**
  RULE: after a cherry-pick, run the gates derived from the change (`vitest related` plus every
  `check:*` whose inputs include a touched path), or all of `ci:lint` + `ci:checks` when that is cheap
  enough, and read their real exit codes before calling the integration done. Mechanism in build:
  `.claude/integrate/` (integration command) plus a PreToolUse guard refusing a raw `git cherry-pick`
  on `develop`/`main`; promotion closes only when that guard's selftest replays the four incidents.
  **SECOND FACE — THE GATE DEFERRED FOR A BUSY RESOURCE, and it was the only one that could see the
  defect** (`integrated-a-range-without-running-its-cheap-gates`, third occurrence). Measured
  2026-09-28: integrating a branch that changed SHIPPED colour tokens (`oklch(L 0 0deg)` →
  `oklch(L 0 none)` for every neutral), I ran 19 derived gates — all green — and postponed
  `check:a11y` because Storybook's port was held by another run. Stacked on that, the combined line
  came back 95 of 103 suites / 426 of 530 tests RED on colour contrast. The cherry-pick guard never
  fired, because I picked onto an `integrate/*` branch and meant to fast-forward develop — a path the
  guard does not see. RULE: a gate deferred because a resource is busy is a HARD BLOCKER on landing,
  written into the plan as one; a change to shipped styles or tokens runs `check:a11y` BEFORE anything
  is stacked on it; and no ref move onto `develop`/`main` — pick, merge or fast-forward — happens
  without a complete green verdict of the full chain for that exact tree.
  By owner decision (2026-09-28) the landing guard is ADVISORY by default and blocks only when explicitly
  opted in (`B100_LANDING_GUARD=enforce`); landing verification is the related gates per change, plus
  build:ci-pr when the owner orders it.
  WHERE ENFORCE APPLIES (owner decision 2026-09-28, "déjalo anotado así"): the hardest control sits at
  the point of no return. Integrations onto `develop` run ADVISORY: each change passes its related
  gates, measured, because develop is reversible and GitLab CI runs the full chain on it. Every
  IRREVERSIBLE step — push/fast-forward of `main`, any release tag (v1.0.0 included), `release:gitlab`
  — runs with `B100_LANDING_GUARD=enforce` in that shell, no exception, so it cannot move without a
  complete green `build:ci-pr` verdict on that exact tree.


## Ledger line archived 2026-10-01 (promoted)

- [promoted] 2026-09-30 — integrated-a-range-without-running-its-cheap-gates: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism .claude/ungated-landing-guard/guard.mjs (selftest run, exit 0); full incident history in .claude/failure-capture/state/incidents.jsonl <!--fc:integrated-a-range-without-running-its-cheap-gates#5-->

Promoted 2026-10-01 to ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui/.claude/ungated-landing-guard/guard.mjs (selftest run, exit 0)
