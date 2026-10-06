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

## DONE (on master, both repos)

- A1 — vendored check green; source recorded home-relative (aabf2de).
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

## ON MASTER, UNVERIFIED — needs review (stopped by the owner, committed as left)

- A6 global (78375b2, merged effd7da) — one state-location module, per-selftest state home
  (`hook-state/sandbox.mjs`), leak detector (`selftest-runner/leaks.mjs`), census, `rotate.mjs`; 151 files.
  Stopped while building the rotate mutants campaign. Not run after the stop: selftests, mutants, full
  runner. Review first: the full runner, `rotate.mjs --dry-run`, and the gates-kit selftest that left
  residue (`gates-kit/a/`, `x/`, `aaa.txt`, `residue.txt`, `.claude/`, not committed) outside its sandbox.
- Profile -> `toolchainFor` wiring + `prefer-on-push` on Angular 19-21 (06e7c52) — `gatesStackOf` removed;
  selftests passed (profile 169, toolchain-for 110, angular-lint-rules 23); mutants and full runner not run.

## QUEUED (not started)

- B1 — Stop fast path when repos are clean + incremental transcript index (covers A5: head-record session
  id fingerprint; A5's premise "integrate as is" was false — no code existed) + git spawn counter (an
  instrument to find spawns to cut, not a speed-up by itself) + target <= 300 ms (host timing = H6).
  Mapped: 8 Stop guards, 4 git + 1 node child per clean turn; config-sync-guard reads every live transcript
  before knowing whether repos are dirty; backlog-guard reads eagerly.
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
