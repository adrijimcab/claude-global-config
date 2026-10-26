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
- Always-loaded budget (measured 2026-10-11): about 79,000 characters load every turn (`CLAUDE.md` 17,040,
  `00-owner-mandates.md` 23,336, `promoted-rules.md` 19,500, `lessons-ledger.md` 13,364, verification contract
  3,746, `sdd-mandate.md` 3,839). The 66,000 target is in no tracked file (rg over ~/.claude excluding
  `projects/`), so it is re-derived first. Plan: classify every block as binding-every-turn, area-specific
  (moves to a `paths:`-scoped rule or to the delegation-time injection) or history (moves to
  `lessons/evidence/`); deduplicate text restated across files; prove that each moved block's trigger fires;
  then a fixed-ceiling gate refuses growth. Where text lives is the orchestrator's decision; any change to
  the WORDING of an owner mandate goes to the owner. Queued, reason (3): it edits the same files that
  `land/odd` rewrites, so it starts after that branch lands. Owner order 2026-10-11: it is the LAST step
  before the session stops and before the final integration to master — after every worker lands and
  after `land/odd`, and before the final report.
- Premise judge labelled sample, deferral reasons (reported 2026-10-12 by session b100-am-ui-f8, its
  measurement): a backlog item was written PENDING with reason 3 ("would preempt work in flight") without
  measuring it, and the premise judge's measure-now case caught it. Decision: no separate guard. A guard keyed
  on the words "reason 3" would be a match over prose, beaten by rewording, and it would duplicate a case that
  already fired. Add the incident as a labelled fail fixture, and its measured counterpart as a pass fixture,
  to the premise judge's calibration set, re-measured over 5 runs. Pending, reason (4): the calibration set is
  its own unit with the rest of the judge's measured precision work.
- Receipt-driven development ON globally (owner order 2026-10-12: «dejar activo lo de gentle-ai y vamos viendo
  trabajando con ello cómo es mejor, dejar anotado de verificar esto»). `gentle-ai review mode status`:
  on (decided by global). VERIFY in practice: the review base follows origin/HEAD, so every clone needs the
  integration-branch sync first. Measure a real review's cost and value on one candidate before reporting.
  Turning it on made the v4 overlay inline the whole review contract in ~/.claude/CLAUDE.md (+104 lines
  always loaded, where a lazy pointer stood before), which the always-loaded budget step must weigh.
- worktree-tenancy (fleet-kit) treats a FINISHED agent as live for its liveness window (measured 2026-10-12:
  agent ac6365ee returned its hand-back, and `git worktree remove` on its worktree was still refused 23 s
  and 77 s later). Fix: end tenancy on the agent's completion record (SubagentStop or the hand-back), not
  only on transcript age. Pending, reason (3): fleet-kit has a writer in flight (landing-guard --git-dir).
- DONE 2026-10-12: f14 landed locally on feature/meet (33943eb..8af8528, land.mjs exit 0, test:all
  green). The @if change is not user-visible (the worker measured 15 panels in one mutation batch either
  way), so its proof is the unit spec, which goes red with the fix reverted (2 of 13 failed) and green
  with it (13 of 13). The migration study was rescued from the company branch into local
  Discovery-FE/docs/migration and the private adrijimcab/discovery-migration-study (3f14d8a, read back);
  the company branch docs/migration-study was deleted on the owner's order.
- Integration branch as ONE source that every tool follows (owner order 2026-10-12: every session must keep
  it current; measured the same day). gentle-ai v4 takes the review base from `refs/remotes/origin/HEAD`
  (v4.0.0 internal/reviewtransaction/target_status.go:248-262). The harness bases Agent isolation worktrees
  on origin/HEAD too (lesson agent-isolation-worktree-based-on-default-branch). In Discovery it resolves to
  main (7f5fe05, the near-empty root). Design: the project's declared source (`.claude/fleet-kit.json`
  integrationBranches[0], or b100's `.claude/integrate/integration-branches.mjs`) stays the only truth. A
  ~/.claude tool `integration-branch/sync.mjs` sets the clone-local `git remote set-head origin <first>`
  from it (local, never pushed). A UserPromptSubmit check warns when origin/HEAD and the declared first
  branch disagree. The promoted rule already obliges the session that moves the branch to update the
  source in the same turn. Pending, reason (1): Agent launches in Discovery are refused until feature/meet
  lands f14, and it must be built test-first with mutants.
- engram 2.2.1 -> 3.3.2 (measured 2026-10-12 from `engram version` and gh releases). v3 confirms the session
  before memory writes and requires `expected_project` on update/delete (our guards only read tool calls, so
  they are unaffected). backlog-content-guard and backlog-owner-guard read `~/.engram/engram.db` with SQL, so
  a v3 schema change could blind them. Four engram servers are running (one since 2026-09-27), and Windows
  cannot replace a running binary. Plan: close every Claude session, back up `~/.engram`, install v3.3.2 by
  the method that installed `%LOCALAPPDATA%\engram\bin\engram.exe` (to be measured), restart, then run a live
  probe of both guards against the real store before trusting them. Pending, reason (1): needs every session
  closed; combine it with the restart v4 already requires. gentle-pi 2.4.0 -> 4.0.0 is NOT needed: it is the
  harness for the Pi agent, and Pi is not installed on this machine (`where.exe pi`: none).
- config-sync-guard attributes another session's paths (owner-pasted block, 2026-10-12): in session
  b100-am-ui-f8 (c4d7f854) it listed lessons-ledger.md and three lessons/evidence files that the orchestrator
  session wrote, as "paths this session made" (path-ownership by timing). The same defect class as the
  integrated-worktree-guard attribution fixed in 916d739. Fix: attribute by the session's own transcript
  writes, as that guard does now, with a red fixture of two sessions. Pending, reason (1): Agent launches
  are refused in Discovery.
  CLOSED 2026-10-12 — config-sync-guard attributes another session's paths: refuted by measurement from session
  b100-am-ui-f8. Its own `capture.mjs capture` ran the auto-condense pass, which rewrote the two orchestrator
  lessons into new evidence files inside b100's shell call, so the guard's attribution was correct; b100
  committed the four paths in 258943d. The item was written from the owner-pasted block without measuring.
- Lesson auto-condense rewrites other sessions' lessons (reported 2026-10-12 by b100-am-ui-f8, its
  measurement): a `capture.mjs capture` call condenses EVERY over-long ledger line, so the next capturer
  writes and then commits other sessions' lesson text. Design question: condense only the capturing key, or
  condense in a separate owned step. Pending, reason (4): a design change to the shared ledger writer.
- Agent process reaper (owner order 2026-10-12, relayed by b100-am-ui-f8, its measurement): orphan bash
  `until … sleep` loops and `sleep 100000` lived about 18 h after their worker ended
  (agent-a83a72cee352af81b); three `sh watch-branches.sh` processes from a removed worktree have lived since
  2026-09-27; and a storybook server outlived TaskStop. The rule is in 00-owner-mandates (closure item 5).
  The lesson worker-left-a-polling-loop-alive is promoted when the reaper lands, because `capture.mjs promote`
  takes the mechanism's path (`--mechanism`), and a `--no-mechanism` would be false. Mechanism to build: one reaper module that
  finds every process (bash, sh, node, cmd, powershell) whose command line names the agent's worktree, the
  agent id or its scratch path, and kills its tree with `taskkill /PID <pid> /T /F`. It is called from
  SubagentStop, from land.mjs, and from b100's `integrate.mjs --close`. Its selftest kills a planted bash
  loop and leaves a sibling session's process untouched. Pending, reason (1): Agent launches in Discovery
  are refused until feature/meet lands f14; build it test-first with mutants.
- Rename `sdd-attempt-cwd-guard` to a name for what it now owns (the cwd of v4 review range commands and
  the retired sdd-attempt verbs): its folder, state, rotate entry, manifests and selftests. Found by the
  owner's SDD sweep 2026-10-12; the rest of that sweep is clean (history and gentle-ai-rendered text kept;
  Discovery CLAUDE.md fixed 0eee82b; host H9 closed). Pending, reason (4): a rename across state,
  rotate.mjs, census and two manifests is its own change.
  CLOSED 2026-10-12 — Rename `sdd-attempt-cwd-guard` to a name: now `review-cwd-guard` (889a278). Selftest 59/59,
  verified by the orchestrator. The worker measured 24/24 mutants, scope with 0 gaps, census, rotate,
  dispatch and contract-path-check all green. A dispatch proof shows `review status` refused from the main
  checkout with a unit worktree ahead and allowed from the unit worktree. No rule line named the guard.
- Brief preflight face: derived gates (contract delivered 2026-10-12 by session b100-am-ui-f8; measured the same
  day by running `node .claude/gate-scope/gates-for.mjs src/lib/components/b100-dashboard/b100-dashboard.component.ts`
  in b100: exit 0, 19 gates, 64 unscoped). The deriver prints `{ gates, reasons, unscoped }` on stdout with exit 0,
  and exit 2 on misuse; it also accepts `--diff <base>` and `--root <dir>`. Design: a brief for a project that
  declares a deriver carries a `PATHS:` line (what the unit will touch) and a `GATES:` line; the face in
  `~/.claude/brief-feasibility` runs the project's deriver on `PATHS:`, refuses a brief whose `GATES:` omits
  any entry of `gates`, and reports `unscoped` as a warning, never a refusal (b100's request: 64 unscoped
  today would make every brief list them all). A deriver that exits 2 refuses with its message; a project
  that declares none is not checked. Pending, reason (1): Agent launches in Discovery are refused until
  feature/meet lands f14.
- Judge re-stop loops: a model does not apply rule 1 reliably (measured 2026-10-12). The stop-input recorder
  showed that b100-am-ui-f8's re-stops at 01:12:31Z, 01:12:44Z and 01:12:48Z carried stop_hook_active true and
  the CURRENT rewrite as last_assistant_message, so the harness input was right. Driving the live v4 rubric with
  a payload of the recorded 12-key shape, stop_hook_active true and a dry-log message, haiku answered ok:false
  in 1 of 5 runs (scratchpad restop-voice.mjs). Rule 1 is deterministic, and a model applies it only most of the
  time. Root fix: take the stop_hook_active decision out of the model, for both prompt judges (voice and premise).
  Design open: whether Claude Code offers a condition on a `prompt` hook, or the judge becomes a command hook
  that short-circuits on stop_hook_active and only then asks the model. Research the official hooks docs before
  choosing, and measure each judge's latency and cost either way. Pending, reason (4): open design. Agent launches
  in Discovery are also refused until feature/meet lands f14. Supersedes the "voice judge re-stop input" item:
  the input is right and the gate is the defect.
  Second defect of the same gate, measured 2026-10-12 in the orchestrator session: the VOICE judge (feedback
  labelled "voice-judge rubric v4") blocked a stop with the reason "insufficient evidence in transcript". That is
  not a verdict its rubric allows. So a judge answer that is not the rubric's JSON can still block, and the
  same text b100 saw at 01:12:48Z came from the voice judge, not the premise judge (that guess, sent to b100, is
  withdrawn). The command-hook gate must also turn any answer that is not a valid verdict into a pass, recorded
  as a malfunction, never into a block.
- Voice judge v3 over-applies rule 8 (measured 2026-10-11 in the orchestrator session): it rejected four
  consecutive replies written entirely as prose paragraphs, with no bullets, tables or lists, citing "datos de
  estado" (names, counts, references inside sentences). Rule 8 fails only ENUMERATIONS that carry a status
  report. Fix: add those four replies from the session transcript as pass fixtures and narrow the rule's
  wording, re-measured over 5 runs per fixture. Pending, reason (3): the rubric lives on master and the next
  landing is assembling; it goes in the unit after it.
  Still present in v4, measured 2026-10-12 in three sessions. b100-am-ui-f8 (c4d7f854): v4 rejected under
  rule 8 four prose paragraphs with no list, giving the reason "the body is a status report, with items about
  the hook, the promotion, the master session and the process kills". The orchestrator: two owner-requested
  reports were rejected in a loop. The judge treats status CONTENT in prose as an enumeration. Two of these
  replies were added as pass fixtures in 95b4455; the rest are in the session transcripts. Still pending,
  together with the judge gate (rule 1 applied in code, not by the model).
- Uncommitted work during a long run (recurred 2026-10-11, `worker-work-left-uncommitted-across-a-stop` 2x: a
  worker an hour without a commit, then the orchestrator's own inline land.mjs fix uncommitted while its
  mutation campaign ran). Mechanism to build: the mutation runner and the selftest runner refuse to start in a
  worktree whose tracked or untracked non-ignored files differ from HEAD, naming them, so a long proof always
  runs on committed work. Pending, reason (3): `mutation-proof/run-mutants.mjs` is vendored byte-identical and
  pinned; the change goes through its source and the vendored sync, and a campaign is running on it now.
- Company guards, wider (requested 2026-10-11 by session b100-am-ui-f8 before it deletes its own denylist;
  the 8-name list in `company-config/company-config.json` measured the same day): match AI tool PATHS by
  path segment (`.cursor/`, `.gemini/`, `.codex/`, `.opencode/`, `.kimi/`, `.windsurf/`, `.aider*`, `.atl/`,
  `.mimocode/`, `.playwright-mcp/`, `AGENTS.md`, `GEMINI.md`, `AGENT-LEDGER*`, `*agent-worktree*`,
  `*subagent*`, `*agent-contract*`), never as bare words ("cursor" is CSS); and attribution in commit
  messages (`Co-Authored-By`, `Generated with`, `cherry picked from`, the robot emoji). Each term is grepped
  against the real company trees before it enters the list (rule `blocking-term-list-drafted-from-one-incident`).
  Pending, reason (1): Agent launches in Discovery are refused until feature/meet lands its held worktrees,
  which waits on the land.mjs test-command fix.
- Per-clone `info/exclude` provisioning (same request, measured 2026-10-11): b100's `.git/info/exclude`
  lacks `.claude/` and the AI directories its tracked `.gitignore` lists today (lines 85, 89, 93, 98, 133);
  once the `.gitignore` drops them they would read as untracked. Mechanism: an idempotent ~/.claude step that
  writes the shared AI-exclusion block into a clone's common `info/exclude` (linked worktrees share it), run
  under the coordination rule on each clone (b100-am-ui, di_1700002_discovery_fe), with a selftest. Pending,
  same reason (1); it must run BEFORE b100's `.gitignore` loses the entries.
- Stale-session guard warning (measured 2026-10-11): a PreToolUse hook group registered after a session
  started does not fire in that session — the orchestrator's session (started before 03383e3) wrote an
  English line and the following Read was not refused; Stop-hook additions did reach the same session, a
  difference not yet explained. Mechanism to build: a UserPromptSubmit check comparing the session start
  with each guard's registration and telling the session to restart. Queued, not started: the owner said
  to launch nothing new until the five running workers finish; the v4 restart reloads every session anyway.
  DONE 2026-10-11: built as `stale-session-guard`, landed on master 386d92a. The Stop-versus-PreToolUse
  difference was explained from code (`hook-dispatch/dispatch.mjs` re-reads its manifest on every run, so
  guards added to an existing group are live mid-session; only new settings.json groups need a restart).

  CORRECTED 2026-10-12: that premise was false. A live probe (Claude Code 2.1.296, `hook-reload-probe/`,
  fixtures `fired-2.1.296.log` and `turns-2.1.296.txt`) showed hook groups added, edited and removed in
  settings.json fire (or stop firing) on the next turn for UserPromptSubmit, Stop, PreToolUse and
  SubagentStart; the orchestrator session confirmed it for judge-gate Stop and SubagentStart. CLAUDE.md and
  rules text are read only at session start. `stale-session-guard` removed in cf1d82d; lesson
  `guard-built-on-an-unmeasured-premise`. Still unexplained: the 2026-10-11 PreToolUse observation above.
- Stale memory-text warning: PENDING, reason (4) (its own design). A session does not re-read CLAUDE.md or
  rules edited after it started (measured 2026-10-12, same probe). Candidate: a content fingerprint of the
  loaded memory files taken at session start, compared on each prompt, telling the session to restart.
- Voice judge re-stop input (reported 2026-10-11 by session b100-am-ui-f8, its measurement): the v2 judge
  rejected four consecutive final messages of one turn quoting content the later rewrites no longer held. The
  v3 worker reproduced the rubric path with real-shaped payloads: a clean last message passes 5 of 5 with
  stop_hook_active true and false, with tools off and on, and rule 1 discriminates. Not reproduced: what the
  harness actually passes on a re-stop. Mechanism to build: a Stop command hook that records, per stop, the
  session, stop_hook_active and a hash and first words of last_assistant_message to hook state, so the next
  occurrence is measured instead of inferred. Pending, reason (1): it needs a live re-stop to measure.
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
  CLOSED 2026-10-12 hook-registration selfcheck flags vendored-edit-guard's two-manifest split: the sidecar
  declared one PreToolUse matcher `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell` while settings.json
  wires the guard through three groups (`Bash|PowerShell` -> pretooluse-shell.json, `Edit|Write|MultiEdit`
  and `NotebookEdit` -> pretooluse-authoring.json); the declaration now lists those three registrations, so
  the selfcheck's per-registration rule holds unchanged (reported by session b100-am-ui-15).
- Post-audit research (official Anthropic docs and repos) for further gains in quality, speed and token
  use -> implement.
- Final list to the owner: done + host-only (`host-backlog.md`).
- Stranded branch `feat/gate-summary` (worktree `.claude-wt/gate-summary`, tip e9bbc0e, 1 commit, 11 files,
  457 lines: run a command and print a short verdict with a per-run log; measured 2026-10-12 with `git cherry`,
  not on master). PENDING, reason (4): it is its own change and no item states the need it serves; decide
  land or drop against the gate-output budget before touching it. Kept, not removed.
- CLOSED 2026-10-12: worktrees `land-odd` (land/odd, dd2ce66) and `odd-migration` (feat/odd-migration,
  19cfcb0) removed on purpose. Their three commits each (route mandate restated for ODD, its budget
  tightening, a v4 settings render) are superseded on master by 4886719, d1c6b04 and the 2026-10-12
  route-mandate rewrite (`route-mandate.md` "Every change runs through ODD"); patch-ids differ only because
  the later versions were rebuilt.
- Actor ownership as one service (owner order 2026-10-12: «NO QUIERO FIXES NI PARCHES, SIEMPRE SOLUCIONES
  ARQUITECTONICAS COMO REGLA», and «Solo se tiene que avisar en la sesión correspondiente»). Measured today:
  four guards each decided "whose is this" with their own heuristic and each told the wrong session —
  config-sync-guard by shell-window timing (b100 and Discovery blocked on an orchestrator ledger line),
  agent-liveness by a folder name (live workers under .claude-wt read as ownerless), resume-before-fresh by
  description words, stash-watch by clone (a Discovery writer's lint-staged stash shown to the orchestrator;
  measured: stash 4e2fde83 content equal to 3c82916, `git diff` 0 lines, tag reaped/stash-4e2fde83, stack 0).
  Per-guard fixes are in flight (path-ownership authorship, liveness linked-worktree test, TENANCY errand
  identity); the architectural answer is ONE ownership module that every guard asks — which session or
  agent wrote a path, owns a worktree, made a stash, holds an errand — fed by recorded events (tool writes,
  capture authorship, SubagentStart/Stop, git operations with the session id), never by timing or names.
  PENDING, reason (4): its own design, to run as tracked ODD after the in-flight fixes land, which it absorbs.
- lint-staged backup stashes left by pathspec commits (reported by the Discovery session 2026-10-12, not yet
  reproduced): `git commit -- <paths>` with lint-staged left the index out of step with HEAD and the backup
  stash behind. Pairs with lesson commit-pathspec-restaged-a-removed-file. PENDING, reason (4): reproduce
  on constructed state first, then decide whether workers commit with pathspecs or stage-then-commit.
- process-reaper/reaper.selftest.mjs is flaky (master, 2026-10-25). On the t8-p1-process-port tree, 1 of 6
  runs exited 1 and 5 exited 0. Its mutant campaign is 51/51 killed. P1u changed only one import line in
  reaper.mjs, so the flake is most likely pre-existing process-timing sensitivity (HYPOTHESIS). PENDING,
  reason (3): the owner froze the backlog-1-6 scope to in-flight units and the six points (L13). The fix:
  reproduce under load, find the timing assumption, and bound it.
  Same class, 2026-10-26: the T4B worker reports that the fleet-kit/orphan-work selftest baseline went red once
  (94/95) under 6-way parallel load and passes alone. Its suspected cause is a time-window check
  (ACTIVE_WINDOW_MS); that is a HYPOTHESIS and is not verified. The locks unit already fixed the same class in
  hook-state/journal and premise-judge (b8c9530), by moving to a virtual clock. Fix the class the same way.
  PENDING, reason (3).
- Anonymous selftest failures (master, 2026-10-25). The locks worker found that some selftests print a failing
  check's name only on stderr or not in the last stdout line, which is the only line the mutation runner
  shows. It fixed hook-state/journal and premise-judge (b8c9530). The other selftests have not been audited.
  PENDING, reason (3): scope frozen by L13. Fix: one shared reporter in the selftest kit, whose last line
  names every failing check, adopted by every selftest.
- Writer commit-as-you-go mechanism (master, 2026-10-25). In this batch, 6 writers (T7, T4e, H1, H3, H5, H6, H7)
  held all their work uncommitted for 40+ minutes, although every brief told them to commit as they go.
  Lesson worker-work-left-uncommitted-across-a-stop is now at 3x, and promotion requires a mechanism. Proposed
  mechanism: a PostToolUse or Stop check on a delegated writer's worktree that tells it to commit once
  uncommitted paths are older than a bounded window. PENDING, reason (3): scope frozen by L13. It is the
  first item for the next batch.
- Promotion mechanism for guard-built-on-an-unmeasured-premise (5x, master 2026-10-25). capture.mjs requires a
  mechanism with a selftest. Proposed: a guard acceptance check that a new guard's selftest drives the
  original incident payload against the incident's own project tree. PENDING, reason (3): scope frozen by L13.
- gentle-ai upgrade past 4.2.0 (master, 2026-10-25). main 5ee1ac77 is 306 commits ahead and has no tag. A
  read-only assessment found no overlay or contract break, but the check "Windows Full Suite (rest)" fails on
  that commit. PENDING, reason (1): waiting for a tagged release (4.2.1 or 4.3.0). Then install it, run sync
  through the overlay wrapper, and run check.mjs.
- Owed judgments for units landed without a final judgment (owner order L18, 2026-10-26). The full list, with
  each unit's open findings, is engram #1899 (topic backlog-1-6/unjudged-landings).
  - Security guards, in this order: T4f foreign-delete-guard, T4e conflict-marker-guard, T4d4 commit-index-guard,
    T4D3 worker-git-guard, T4B orphan-work + eval-guard.
  - Then LOCKS and T4C (their follow-ups are unjudged).
  - Then T9A, T4A2, T6C, T7 and T10.
  - Last, the T8 port migrations.
  PENDING, reason (2): the owner ordered the landing without these judgments. Run a judgment-day on each fix
  delta, in that order.
- Voice judge calibration (T9A, landed 2026-10-26). On the owner's 12 labels, 6 runs each, the live v7 agrees on
  22 of 72 judgments, v8f on 52 and v8g on 61. v8g was derived from those same labels, so 61 is optimistic.
  No rubric meets the ship bar (ship-bar.json: v8g, met: false). The owner promoted v8g anyway on 2026-10-26
  («Deja el que mas cosas tenga y el que mejor hecho este de la voz… dejalo metido»), recorded in
  voice-judge/promotion.json with bar "not met". Open risk: v8g blocked 92% of unlabelled replies when measured,
  so watch its live block rate after the landing. The 10-reply v8g packet (measure.mjs --packet) is still the
  first out-of-sample test. Open in it: the `third-person-su-possessive` fixture is unstable (it passes 2 of 6
  under v8g), and ship-bar.json's measuredOn is a UTC date. PENDING, reason (3): measure the live block rate on
  the next batch.
- Pending judge is live (T4A2, landed 2026-10-26): settings.json runs `judge-gate/run.mjs pending` on Stop, and
  backlog-guard is no longer in hook-dispatch/manifests/stop.json. DONE in landing branch
  land/checkpoint-backlog-1-6 (5bddd1d).
- T7 full-chain-lock proofs still owed (landed 2026-10-26 in b854954, no final judgment). Master re-ran the
  runner selftest (104 passed), the guard selftest (137 passed), rotate (106) and hook-dispatch (43/43) on the
  merged tree. The worker measured guard mutants at 62/62 and runner mutants at 77/77, but the runner campaign
  ran before its last commit 1db2cfe; its rerun was reaped for low memory. The rotate mutants with T7's new
  entries were never run. The guard goes live with this landing: it is registered in
  hook-dispatch/manifests/pretooluse-shell.json, so from then on a full chain run without the machine-wide lock
  is refused and the refusal names the runner command. PENDING, reason (3): run both campaigns on the next batch.
- C8 launcher unwrap (vendored shell-command). b100's fix has landed at its source and was pushed to its tooling
  backup (2026-10-26): `fix(shell-command): lex cmd scripts in a cmd dialect and carry runner scripts without a
  program of their own`. b100 re-ran launchers 167/167 and cmd-dialect 38/38. Its worker reports
  actions.selftest 125/125 on a copy. Contract: a runner (Start-Process, iex, env -S) behaves like `bash -c`.
  The written entry stays, with resolveCommand(...).index === -1, and the carried command is a nested script.
  Next: vendored sync and check in the worktree feat/c8-vendored-launchers (b4d9ee2), then the importer selftests
  and campaigns, then integration. b100 still has open: 3 stale ungated-landing-guard mutants and the unmodelled
  cmd `( )` grouping. Master read b100's source on 2026-10-26 (shell-command.mjs:81-130, :584) and passed two
  more gaps to b100: `cmd //c` (the Git Bash spelling) is not recognised as a nested script, and a `%VAR%` word
  gives no "unresolvable" signal that consumers can use to fail closed.
  b100 fixed all three (//c and //k, %VAR% unresolvable, cmd `( )` groups) in its tooling backup commit c7480f4,
  on top of ef09b44. b100 re-ran launchers 167/167, cmd-dialect 67/67 and includeNested 6/6. Mutation was not
  re-run, by the owner's «sin mutantes». A new export, `isUnresolvableWord(word)`, lets the guards here fail
  closed on `$`/`%` words. Sync C8 from c7480f4. PENDING, reason (3): the owner froze new work until backlog-1-6 lands (L18). It is the
  first unit of the next batch.
- T8 port units still to do after this landing: F2 (re-export company-remote's fold), G2/G3 (git consumers), G4
  (delete the wrappers), P2u (rotate and file-lock liveness), J1-J4 (journal port), H4 and H8 (remaining guards),
  Z (census enforcement). Design: engram #1885. PENDING, reason (4): each is its own unit on the landed master.
- eval-guard follow-ups (T4B worker, 2026-10-26):
  - The tokenizer does not honour the PowerShell escape `` `" `` inside a double-quoted string, so a command
    after `"x`"y";` can sit inside a misread quote and go unjudged. This predates T4B.
  - An arithmetic `(( ... ))` whose quoted operand crosses its line is read as plain parentheses, so it fails
    closed, and a harmless multi-line arithmetic in a delegated script is refused.
  PENDING, reason (3).
- commit-cadence-guard follow-ups (T10 worker, 2026-10-26):
  - The guard is listed in hook-dispatch/manifests/pretooluse-language.json, the only PreToolUse manifest with no
    matcher, so the name no longer says what it covers. Renaming it (for example pretooluse-all) needs a
    settings.json change.
  - A deletion-only change has no mtime, so the guard does not see it.
  - `git -C <dir>` and a `cd` into a variable are not followed when locating the worker's worktree.
  - Measured: the PreToolUse payload `cwd` is the launch directory, never the worker's worktree. Every guard
    that judges `cwd` alone misses TENANCY-placed writers. Audit the guards that do so.
  PENDING, reason (3).
- Mutation campaign paths gap (T6C worker, 2026-10-26): a failure-capture campaign slice that mutates no
  capture.mjs code never copies config-sync-guard, which fixture-loop.mjs reads with readdirSync rather than an
  import. Full runs hide the gap. Fix: derive campaign paths from the runtime file reads, or list them in the
  campaign. PENDING, reason (3).
- Loaded-set budget: `capture.mjs budget` measured 9,684 OVER the 147,000 global ceiling, counting a worktree's
  CLAUDE.md as a project (T6C worker, 2026-10-26). Re-measure on master after the landing, and decide whether a
  linked worktree counts as a project. PENDING, reason (3).
- backlog-1-6 landed on master at cab5a3a (2026-10-26), pushed to adrijimcab. The full selftest runner gave 172/172
  green on that tree, and land.mjs exited 0. Integration found four seam defects that each unit's own gates could
  not see. All four are DONE on master:
  - fixture-loop expected two hook-state modules, but LOCKS made the ledger lock use file-lock.mjs (c090690).
  - T4C named a data table dependency-mutants.mjs, a campaign name; it is now dependency-mutant-set.mjs (a938e54).
  - T4B made eval-guard import the digest from the hook journal, so the producers scan read its own refusal
    kinds as journal kinds. The digest policy moved to hook-state/input-digest.mjs, with its selftest and 3/3
    mutants (f4493ad, cab5a3a).
  - The foreign-delete-guard selftest left the <tmp>/claude folder it created (d70affc).
  Proof of the cleanup fix: in an empty private TEMP the fixed run leaves nothing and the old run leaves `claude`.
- Peers after the landing (2026-10-26): b100-am-ui-f8 and di-1700002-discovery-fe-6b both reported ok (Bash,
  Write, delegation, capture.mjs keys). Neither can restart itself, so both still run the old settings.json until
  the owner restarts them. PENDING, reason (2): the owner restarts the sessions.
- Worktrees closed after the landing: 28 integrated worktrees and their branches were removed, each re-measured
  just before removal (git cherry empty, clean, no reparse point), and git branch -d refused none. A process sweep
  of those worktrees was refused by the permission classifier, so it did not run. No removal failed on a locked
  file. PENDING, reason (2): the owner allows the sweep or does it.
- Six ~/.claude worktrees still hold commits master lacks. Each needs integration or a decision, PENDING:
  - feat/c8-vendored-launchers: 1 commit, the C8 vendored sync. First unit of the next batch, reason (3).
  - feat/gate-summary: 1 commit of 2026-10-11, gate-summary run-and-verdict command. Reason (4).
  - wip/pollution: 1 commit of 2026-10-05, the stopped selftest-runner pollution detector. Reason (4).
  - wip/transcript-index: 5 commits of 2026-10-05, the incremental transcript index. Reason (4).
  - fix/t6b-claude-md-lazy-review: 1 commit of 2026-10-19, which keeps the review execution contract lazy. Reason (3).
  - fix/t5-angular-refs: 2 commits of 2026-10-19 (Angular hydration, zoneless and reportProgress notes). Their
    patch-ids are not in master although T5 was recorded as landed (10b2993). Check whether that content is on
    master under another patch before integrating or dropping it. Reason (3).
- Mechanism for lesson tree-written-during-its-full-chain (1x, 2026-10-26). While full-chain-lock holds its lock,
  refuse a write by the holder's session into the tree the chain measures, or into TEMP/claude. The holder
  record stores the session (full-chain-lock/chain-runner.mjs:95), which can be 'unknown'
  (cli-arguments.mjs:59), and it does not store the tree it measures, so the record must first gain the tree
  path. The selftest must drive the real case: a Write and a git commit into a tree under a running chain. PENDING, reason (3): the owner froze new work until the next batch.

## ORDER (decided 2026-10-11)

R1 -> R2 -> R3 (nothing can land from the host until R2 is green) -> B1 with the transcript index ->
host items H11, H1, H6, H10 as each is unblocked -> token/perf -> `isMain` helper -> summarising gate
runner -> portability split -> gentle-ai pin -> B7 -> A3/C2 -> deep audit -> Track P when the owner says go.

Session close (owner order 2026-10-11): land every finished worker at checkpoints -> `land/odd` with the v4
install once b100 finishes FR, dashboard and chart -> always-loaded budget (LAST step) -> final integration
to master with one full run -> full report of done and pending, recorded in engram.

## DROPPED (with the reason)

- Back-repo write guard requested by the Discovery session, 2026-10-26. The owner's decision, verbatim: «No lo
  hagas, se deja como memoria de esa prouyecto, ya estoy atengo yo para que no pase». His rule against touching
  the back is kept as a Discovery project memory in engram, not as a ~/.claude mechanism.

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
