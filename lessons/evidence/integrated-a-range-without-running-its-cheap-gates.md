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

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`integrated-a-range-without-running-its-cheap-gates`** — Every integration onto `develop` runs
  every gate that can READ the changed paths, never a gate list I chose. **A hand-picked gate set is a
  bounded search written down as coverage.** RULE: after a cherry-pick, run the gates derived from the
  change (`vitest related` plus every `check:*` whose inputs include a touched path), or all of
  `ci:lint` + `ci:checks` when that is cheap enough, and read their real exit codes before calling the
  integration done. Mechanism in build: `.claude/integrate/` plus a PreToolUse guard refusing a raw
  `git cherry-pick` on `develop`/`main`.
  - **THE GATE DEFERRED FOR A BUSY RESOURCE, and it was the only one that could see the defect.**
    RULE: a gate deferred because a resource is busy is a HARD BLOCKER on landing, written into the
    plan as one; a change to shipped styles or tokens runs `check:a11y` BEFORE anything is stacked on
    it; and no ref move onto `develop`/`main` happens without a complete green verdict of the full
    chain for that exact tree.
    By owner decision (2026-09-28) the landing guard is ADVISORY by default and blocks only when
    explicitly opted in (`B100_LANDING_GUARD=enforce`); landing verification is the related gates per
    change, plus `build:ci-pr` when the owner orders it. The hardest control sits at the point of no
    return: integrations onto `develop` run the full chain ADVISORY (develop is reversible and GitLab
    CI runs the full chain on it), but never below the unit-suite floor of the face below; every IRREVERSIBLE step — push/fast-forward of `main`, any release tag,
    `release:gitlab` — runs with `B100_LANDING_GUARD=enforce`, no exception.
  - **THE GENERATOR THAT READS THE CHANGE INDIRECTLY (2026-09-30).** A new card example landed
    after a 16-gate run I chose; `testing/goldens/content-projection-component.golden.ts` is
    generated from the real examples directory, so `check:goldens` and `golden.spec.ts` went red on
    develop and a worker found it three integrations later. RULE: every fast-forward of develop
    requires a green `npm test -- --all` on that exact tree, on top of the related `check:*` gates;
    a list I pick is never the landing proof. CLOSED BY MECHANISM (`integrated-a-range-without-running-its-cheap-gates`,
    fourth occurrence): the unit suite is a FLOOR the landing guard REFUSES in EVERY mode, overriding
    the advisory default above for that one requirement. A ref move onto `develop`/`main` is denied
    unless a complete, green, unmoved verdict of the tree's own `ci:test` expansion (derived from its
    `package.json`, never hardcoded) graded that exact tree, or one of the bookkeeping trees beneath
    it. Record it with `node .claude/gate-run/gate-run.mjs ci:test` in a clean worktree of the target
    commit. The full `build:ci-pr` chain stays advisory unless `B100_LANDING_GUARD=enforce`. Replayed
    on the real incident (develop `283d2c77` -> `cfe6a6ff`, real verdict store): DENY in both modes.
  - **THE UNIT SUITE NEVER TYPE-CHECKS A SPEC (2026-09-30,
    `integrated-a-range-without-running-its-cheap-gates`, fifth occurrence).** develop was
    fast-forwarded twice on a green `gate-run.mjs ci:test` plus a list I picked; `ci:test` (harness +
    `test:all-coverage`) never type-checks a spec, and `check:spec-typecheck` — the only gate that does —
    was red afterwards (a13f6b18: 2 x TS2322; 5ead4385: 5 x TS2532), caught by GitLab pipeline 5824.
    RULE: a move whose content changes any `*.spec.ts` is also graded by `check:spec-typecheck`.
    CLOSED BY MECHANISM: the landing guard's floor now has a second part, refused in EVERY mode — when
    the trees differ by a `*.spec.ts` (added, modified, deleted or renamed; decided on the tree the
    branch points at today versus the tree it would point at, `touched-specs.mjs`), a complete, green,
    unmoved gate-run verdict of `check:spec-typecheck` on that exact tree (or a bookkeeping tree
    beneath it) is required beside the `ci:test` one. The gate labels are derived from the tree's own
    `package.json`; a tree that declares no such script is not asked for one. Record it with
    `node .claude/gate-run/gate-run.mjs check:spec-typecheck` in a clean worktree of the target commit.
    A bookkeeping-only push over an already published spec stays unflagged. Selftest 225/225, mutants
    87/87 killed (one survivor found and closed by a Spanish-half assertion). Replayed on the real range
    `15193b23..d20ca9d2` (touches the date-range parent-sync spec): DENY in both modes, naming the
    missing spec type-check verdict.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/integrated-a-range-without-running-its-cheap-gates.md`.
````
