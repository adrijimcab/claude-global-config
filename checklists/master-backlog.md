# Master backlog — global config + b100 tooling

Single versioned source of the backlog (it used to live only in engram and in session transcripts, which
a lost container takes with it). Criterion: an item stays only if it fixes a measured, recurring or
breaking problem; anything that only watches the tooling or keeps its books is cut, with the reason
written. Close an item by moving it to DONE with its proof (commit, selftest count, measurement), or to
DROPPED with its reason. Host-only work lives in `checklists/host-backlog.md`.

@es Fuente única y versionada del backlog. Un ítem se queda solo si arregla un problema medido, que se
repite o que rompe algo; lo que solo vigila al tooling o le lleva la contabilidad se corta, con su motivo.
Se cierra pasándolo a DONE con su comprobante o a DROPPED con su motivo. Lo que solo puede hacer la
máquina del dueño vive en `checklists/host-backlog.md`.

## Merge of 2026-10-11 — one backlog from three sources

This revision merges (1) this document as the cloud sessions left it on 2026-10-06, (2) the engram backlog
it replaced (`backlog/main-3-master` items 15-35 and the re-plan `sdd/hardened-dev-environment/replan`), and
(3) a read-only verification run on the owner's Windows host on 2026-10-11, after both repos were pulled
(`~/.claude` 52ff430 -> ebde8cf, b100 tooling 5e69973 -> 4cb89d8, both fast-forward). Where a line below
says "host 2026-10-11", the figure was measured on that host that day by the verifier; "cloud" means the
claim comes from the cloud session and was not re-run on the host.

@es Esta revisión mezcla el documento que dejaron las sesiones en la nube el 2026-10-06, el backlog de
engram al que reemplazó y una verificación de solo lectura hecha en la máquina del dueño el 2026-10-11,
después de traer los dos repos. «host 2026-10-11» es una medición de ese día en esa máquina; «cloud» es una
afirmación de la sesión en la nube que no se volvió a correr en el host.

## RED ON THE HOST (host 2026-10-11) — repair first

- R1 — `vendored check` is RED on the host: exit 1, 25 modules, 3 failures, all "EDITED IN THE KIT":
  `mutation-proof/mutants.mjs`, `mutation-proof/scope.selftest.mjs`, `mutation-proof/scope.mutants.mjs`.
  A1 below was true in the cloud only. `sync` is the wrong remedy for this verdict (it would overwrite the
  kit edits): diff the three files against the b100 source first, then move the edit to the owning side
  and re-pin. Closes H11.
- R2 — the full selftest runner is RED on the host: `selftest-runner/run.mjs --root ~/.claude` exit 1,
  95 of 109 green, so `land.mjs` cannot land anything from this machine until it is fixed. Three kinds:
  - 2 selftests need a privilege the owner's Windows user lacks (`EPERM ... symlink`):
    `hook-state/rotate.selftest.mjs:116` and `project-profile/selftest.mjs:476`. Build those fixtures with
    a junction or a constructed directory; `project-profile/mutants.mjs` then exits 2 "not measured", so
    the cloud's "profile 169" and its campaign are unproven here, and the rotate campaign was never built.
  - `hook-state/census.selftest.mjs`: 2 FAILs on the live home. The census counts 4 files that are not
    repository code (`jobs/*/tmp/*.mjs`, two under `plugins/marketplaces/`) as Claude-home joins, and it
    flags `project-profile/selftest.mjs` for not calling `isolateState(`. Scope the census to tracked
    files and isolate that selftest.
  - 11 selftests reported "leaked into the live state". The leak detector cannot tell whose write it was,
    and live sessions' hooks were writing during the run (one path carried the verifier's own session id),
    so these are UNATTRIBUTED, not proven leaks. Make the detector attribute a change (ignore paths a live
    session's own hook wrote during the window, or snapshot under a lock) so a landing run on a machine
    with live sessions is decidable. Covers the old A6 residual.
- R3 — the leak detector does not watch the tree's `git status` or temp leftovers, the gap behind the
  gates-kit residue reported on 2026-10-06 (absent on the host on 2026-10-11). Extend
  `selftest-runner/leaks.mjs`; the stranded branch `wip/pollution` (97a9ba5, pushed 2026-10-11) holds a
  snapshot of exactly those two dimensions and is the reference, not a second detector to land.

## DONE (on master, both repos)

- A1 — vendored check green; source recorded home-relative (aabf2de). Cloud only: RED on the host, see R1.
- A2 — b100 integration runs the tooling gates of the live tree first; "not measured" counts as red.
- A4 — dispatcher journals every block (1a694a4); false-block rate over random hand-labelled samples,
  Wilson interval, minimum 10 labels (78eb53c, 8804323, 0414d91).
- B2 — eval-guard comments/continuations (722b0b0); resume-before-fresh sibling + current session only
  (37a5103, a8ca9df); orphan-work POSIX/UNC/Git Bash paths (628db80).
- B3 — global always-loaded set 123.7k -> 64.1k chars.
- B4 — b100 127.5k -> 67.7k; total 131.8k under the 147k ceiling; AGENT-LEDGER < 40k; supersede.
- B5 — overlay prune kind, sync wrapper, gentle-ai v4 region ids, self-heal (cb12132, 68d252d, 36429b2).
- B6 — mutation scope check in both repos, 8 missing campaigns, vendored pin (aa406bb, 628c89e, d2a5d24).
- B8 — Nest and Node+Vitest gates, pinned toolchains, per-repo findings register (e48f9cf, 288c28e, b3695d4).
- B10 — agent-toolset-check exemptions replaced by positive capability profiles (334a93f).
- b100 A6 half — one state module, isolated selftests, leak census, sandboxed integration-guard.
- entry-point-check, backup allowlist, judge-premises rule (feba50d), rtk DROP verdict (6475ab6),
  host-backlog H1-H7 (d839206).
- Anti-recurrence — vendored-edit guard (668e130), undeclared duplicates (1c8b155), journal producers
  (12dedb8).
- Premise-judging hooks — claim-guard "attributed premise" class (126/126, 76/76 mutants) + native Stop
  `prompt` judge journaled for guard-precision (56/56, 48/48) + H8 (425c97d).
- Frontend standards for ALL sessions and projects (99314b7): `project-profile` detector + SessionStart
  line (154/154, 97/97 mutants, ~92 ms, no spawn); path-scoped `rules/fe-{angular,typescript,testing,styles}.md`
  gated by the project's real major; `skills/angular-best-practices` restructured with one file per major
  (19/20 full, 21/22 delta over the official `node_modules/@angular/core/resources/best-practices.md`);
  `project-bootstrap` and `frontend-audit` skills (invocation only); canonical `.claude` structure
  re-judged item by item (`skills/project-bootstrap/references/structure-verdicts.md`); five committed
  `agents/*.md.bak` removed (no producer remains). Always-loaded set unchanged (64.7k).
- Angular 19/20/21/22 official-docs research (angular/angular `adev/` + angular-cli sources, npm) feeding
  the rules and skill above.
- One mutation-proof engine (3add3b9, b100 4cb89d8): b100 owns runner + `kill-kind.mjs` (assertion vs
  crash) + scope/planner; `~/.claude` vendors it through `vendored/` (25 pinned modules); `fleet-kit/vendor/`
  folded in; 14 crash-only kills in b100 turned into assertion kills. Scope rule: a hook entry that calls an
  imported verdict helper decides — G 44 -> 49 deciding, 0 gaps. Premise corrected: resume-before-fresh and
  claim-guard were already in scope; the invisible ones were orphan-work and worktree-tenancy.
- Per-major gates toolchains (a99931f): angular-19/20/21/22, nest, node-vitest pinned with npm-verified
  versions and lockfiles; `toolchainFor(profile, hostNode)` refuses instead of falling back; angular-eslint
  rules gated by major (`no-experimental` / `no-developer-preview` from 20); reporters pinned in every gate;
  `eslint --quiet` banned. Karma gate unmeasured here (no Chrome) -> H10.
- gentle-ai upgrade — verdict DROP for now (stay on 2.9.1), decision recorded as H9 with evidence.
  Host 2026-10-11: `gentle-ai --version` prints 2.9.1.
- Delivered before 2026-10-06 and recorded only in engram until now (`backlog/main-3-master` items
  26-32): journal backup tool (b255677; 27 journals backed up and verified to
  `~/.claude-backups/journals-2026-10-04`), baseline record (96e4a70; Stop median 1,606.7 ms, p95 1,940.6),
  `bilingual-output/` (947f214), `hook-state/` locations + v2 journal (9b71884), `jsonl-tail` (1195f6e),
  `kill-tree` + git sandbox (63897ec), dismiss CLI (6c6b090), guard-precision report (85da97e), gates-kit
  verifier (865aab6), agent-contract templates (fd07e09), the first Angular gates (3bffc1c), the
  `root-cause-stated-before-measured` promotion (639e0ef).
- Host 2026-10-11, confirmed: always-loaded set — global raw 65,108 / counted 63,802 (B3), b100 total raw
  132,789 / counted 131,483 under the 147,000 ceiling (B4); `toolchain-for` selftest 110 and campaign
  42/42, `angular-lint-rules` selftest 23 and campaign 20/20 (06e7c52); bat, fd, sd, eza resolve on PATH
  and no `agents/*.md.bak` exists (old B9, part of H4).

## ON MASTER, PARTLY VERIFIED (host 2026-10-11)

- A6 global (78375b2, merged effd7da) — one state-location module, per-selftest state home
  (`hook-state/sandbox.mjs`), leak detector (`selftest-runner/leaks.mjs`), census, `rotate.mjs`; 151 files.
  Host: `rotate.mjs --dry-run` exit 0, plan 34 ARCHIVE / 369 KEEP, and `--apply` would be refused while two
  live sessions are registered; 37 of the KEEP entries are selftest litter in live state
  (`backlog-guard/selftest-*.json`, `s-1.json`) that the plan keeps; the gates-kit residue paths are absent.
  Still open: R2 (census, rotate selftest, attribution) and the rotate campaign; H1 runs only after R2.
- Profile -> `toolchainFor` wiring + `prefer-on-push` on Angular 19-21 (06e7c52) — `gatesStackOf` removed.
  Host: toolchain-for and angular-lint-rules confirmed (above); `project-profile` selftest and campaign not
  runnable (R2, symlink EPERM).

## QUEUED (not started)

- Voice judge: restore the Rioplatense voseo criterion (2026-10-11). Measured in the live settings.json:
  rubric v2 judges structure (prose vs enumerations) and asks for warmth, but no rule fails a reply to
  the owner written in Spanish with "tú"/"usted" instead of "vos"; v1 had "no warm Rioplatense voseo" as a
  fail criterion, and output-styles/gentleman.md:56 asks for Rioplatense voseo. Add it as its own rule,
  calibrated on real replies (owner-accepted voseo replies must pass, a neutral-Spanish prose reply must
  fail) through voice-judge/measure.mjs. Waiting for the owner's go (no new launches until the report).

- B1 — Stop fast path when repos are clean + incremental transcript index + git spawn counter (an
  instrument to find spawns to cut, not a speed-up by itself; the owner asked for it on 2026-10-06) +
  target <= 300 ms (host timing = H6).
  Mapped: 8 Stop guards, 4 git + 1 node child per clean turn; config-sync-guard reads every live transcript
  before knowing whether repos are dirty; backlog-guard reads eagerly.
  Corrected 2026-10-11: the earlier note "A5 — no code existed" was true only of the cloud checkout. The
  index exists on the host branch `wip/transcript-index` (5 commits, tip a464eb6, pushed 2026-10-11):
  cache keyed by path/size/mtime, appended bytes only, head fingerprint of the first 4,096 bytes; its
  author measured 129 transcripts / 415 MB at 1,492 ms cold and 25 ms warm, selftest 65, campaign 74/74
  (not re-run on 2026-10-11). It predates the A6 state module: re-apply it on master through
  `hook-state/sandbox.mjs`, then build the fast path on it.
  Host 2026-10-11: Stop replay, 20 runs, median 726.2 ms, p95 787.4 ms with 4 live transcripts (118.6 MB);
  the run reported no repo scenario, so it is not like-for-like with the 2026-10-04 baseline (1,606.7 /
  1,940.6 ms, 14 live transcripts). Above the 300 ms target either way.
- Guard merges of the old re-plan (brief-lint, turn-markers, backlog-write-guard, repo-hygiene): none is on
  master (host 2026-10-11: those directories do not exist). Decision: only `repo-hygiene` is built, as part
  of B1, because it is where the Stop cost is. The other three are not built on a prediction: each is
  decided from its false-block rate once H8-style labelled samples exist (10 labels per mechanism), and a
  guard that is not noisy is left alone. Rejected: merging all four up front, which rewrites working guards
  for an unmeasured gain.
- Guard journals are still unusable as evidence: host 2026-10-11, 17,509 unclassified lines, 9 blocks in the
  v2 journal in total, 0 labelled samples. Rotating the polluted registries is H1 (after R2).
- Track P — Discovery-FE hardening only (owner decision 2026-10-06: not discovery-api, not conversion_js):
  coverage thresholds actually applied (no `karmaConfig`, `angular.json:112-132`, measured 2026-10-05) and
  the Angular gates of this kit for that app, as its own change in that repository through its own flow.
  Not started: the owner said to wait for his go.
- b100 tooling, host 2026-10-11: no selftest runner entry was found under b100 `.claude` (searched to depth
  4), so the b100 half of "C2 one final full run" has no single command yet; and three untracked paths sit
  under `git-ref-guard/` (`backup-dropped-tips`, `pre-rebase`, `reference-transaction`) that no session of
  this merge created — owned by the b100 session to commit or remove.
- Shared `isMain` helper replacing 73 hand-rolled entry checks (G 46, B 27; 66 false in a symlinked run;
  `fleet-kit/lib/hook-io.mjs` `runWhenMain` is the correct base); entry-point-check requires it.
- Summarising gate runner (rtk replacement): full log with `EXIT=`, GREEN|RED line, capped failure excerpt,
  log path, "green with error marks".
- Token/perf — autoCompactWindow + compact instructions; drop UserPromptSubmit `echo` and per-prompt
  `skill-registry refresh` / b100 selfcheck; `if` filters (no hook has one today); drop gentle-ai
  `review stop-hook` via overlay while RDD is off; `disable-model-invocation` for off-stack skills
  (go-testing, nextjs-app-router, react-best-practices, gentle-ai-bench, GitHub-workflow skills);
  attribution settings; effortLevel verification; plugins at user scope; weigh the premise judge's
  per-turn background-model call.
- Portability and hermeticity — split hermetic selftests from host checks (`doctor`): G 10 REDs on Linux,
  b100 17 (real Stop manifest, `C:/Users/...` paths, real repos with TypeScript, npm-cli path, Windows job
  objects); b100 PostToolUse entries hardcode `C:/Users/...`.
- gentle-ai version pin in `gentle-ai-sync-guard`: refuse a sync whose binary major differs from the pinned
  one (a v4 sync would leave a UserPromptSubmit hook that exits 1 on every prompt).
- 200-line rule: only b100 `AGENT-LEDGER.md` (467 lines) exceeds it.
- Path-scoped rules from `~/.claude/rules/` inside subagents: unverified (host check, like H2).
- B7 — lessons for this session's real bugs via `capture.mjs`, each with its anti-recurrence mechanism;
  the three named by the owner (reconcile order, duplicated stub, monolingual message) have no trace in
  either history: they need the owner's data, never invented.
  Corrected 2026-10-11: they do have a trace, in engram, and they came from the orchestrator's re-plan (B7),
  not from the owner. Reconcile order: the ledger must be written atomically (temp + rename) BEFORE the
  spool is unlinked, or a crash between the two loses or duplicates a lesson (old cross item 13). Duplicated
  stub: `capture.mjs promote` on an already-stubbed key adds a second stub instead of updating it (old cross
  item 85). Monolingual message: `promote --no-mechanism` prints the caller's reason verbatim in both
  halves, so an English reason leaves the `@es` half in English (measured 2026-10-04). Each needs a RED
  case first; none was reproduced on 2026-10-11.
- A3 — closure doc: CLOSED/DROP per item with proof; old-plan checkboxes retired.
- Owner premises register — `checklists/owner-premises.md` (started; judged during the audit).
- C2 — one final full run of both repos.
- Deep multi-agent audit of both repos (owner premises judged too) -> fix findings -> verdict. Queued
  questions: vendoring direction (generic engines owned by the b100 project and vendored into the
  user-level config through a hardcoded Desktop path — should the user level own them?); b100
  fleet-env/scratch-dir 1 surviving mutant; b100 worktree-work 1 refused mutant; hook-registration
  selfcheck flags vendored-edit-guard's two-manifest split.
- Post-audit research (official Anthropic docs and repos) for further gains in quality, speed and token
  use -> implement.
- Final list to the owner: done + host-only (`host-backlog.md`).

## ORDER (decided 2026-10-11)

R1 -> R2 -> R3 (nothing can land from the host until R2 is green) -> B1 with the transcript index ->
host items H11, H1, H6, H10 as each is unblocked -> token/perf -> `isMain` helper -> summarising gate
runner -> portability split -> gentle-ai pin -> B7 -> A3/C2 -> deep audit -> Track P when the owner says go.

## DROPPED (with the reason)

Carried from the engram re-plan of 2026-10-05 (`sdd/hardened-dev-environment/replan`); the 119-task list it
replaced (`sdd/hardened-dev-environment/tasks`, `tasks-2`) is retired, checkboxes included.

- Lesson families, fold, re-keying, mechanism-backing and pay records, pay table: bookkeeping of lessons;
  prevents no defect.
- Repo-wide mutation aggregate: the landing already proves the decision modules it touches.
- Runner self-mutants and campaign classification: tooling testing tooling.
- Overlay selftest split: readability of one test file, no defect.
- Retiring `agent-toolset-check`: B10 gave the same guarantee for a fraction of the work.
- Windows fixture hypotheses with no incident (`enotdir`, `own-runner`); stale-lock race with no incident.
- Secondary precision signals and an entity-grounding guard: no measured failure behind them.
- The 2026-10-18 date gate for guard verdicts: superseded by labelled samples (A4, H8).
- The transcript index's pre-offset window check: the head fingerprint is enough (B1 note).
- `selftest-runner/pollution.mjs` as a second detector: one question, one answer (R3).
- discovery-api and conversion_js hardening: owner decision 2026-10-06 (Track P is Discovery-FE only).
- rtk: H7.
