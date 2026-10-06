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

## IN FLIGHT (redone: the previous session's worktrees were lost with its container)

- A6 global — one state-location module for every path, per-selftest state home, leak detector, census,
  `rotate.mjs` (registries clean break; host apply = H1).
- Premise-judging hooks — claim-guard "attributed premise" class + native Stop `prompt` hook + H8.
- Research: Angular 19/20/21/22 official docs (from angular/angular `adev/` sources) and gentle-ai upgrade
  (build, simulate sync in an emulated home, verdict, converge plan).

## QUEUED

- B1 — Stop fast path when repos are clean + incremental transcript index (covers A5: head-record session
  id fingerprint; A5's premise "integrate as is" was false — no code existed) + git spawn counter (an
  instrument to find spawns to cut, not a speed-up by itself) + target <= 300 ms (host timing = H6).
- Shared `isMain` helper replacing ~74 hand-rolled entry checks (symlink false-green); entry-point-check
  requires it.
- Summarising gate runner (rtk replacement): full log with `EXIT=`, GREEN|RED line, capped failure
  excerpt, log path, "green with error marks", pinned reporters, `eslint --quiet` banned.
- Token/perf — autoCompactWindow + compact instructions; drop UserPromptSubmit echo and per-prompt
  selfcheck; `if` filters on hooks; drop gentle-ai review stop-hook via overlay while RDD is off;
  mechanised rules out of the always-loaded set; `disable-model-invocation` for off-stack skills;
  attribution settings; effortLevel verification; plugins pr-review-toolkit / security-guidance /
  typescript-lsp at user scope.
- Portability — Windows-only selftests (paths, drives, backslashes), config-sync-guard `C:\` hardcode;
  verify config-sync-guard ms float flake and the Stop-manifest test reading the real `~/.claude`.
- One owner for the two divergent mutation-proof runners (global vs b100).
- Verdicts emitted through a helper are invisible to the mutation scope check (resume-before-fresh,
  claim-guard…).
- 200-line instruction file recommendation (Claude Code warns above it).
- Path-scoped rules from `~/.claude/rules/` inside subagents: unverified (host check, like H2).
- Frontend JS/TS standards for ALL sessions and projects: `rules/fe-*.md` (path-scoped, < 200 lines),
  `project-profile` detector + SessionStart line, `project-bootstrap` skill, `frontend-audit` skill,
  `.bak` hygiene; canonical `.claude` structure re-judged item by item (`.mcp.json` for project MCP
  servers such as `ng mcp`, `CLAUDE.local.md`).
- Angular 19/20/21/22 version-aware: feature matrix, per-version skill files, docs source per major,
  per-major gates toolchains + `toolchainFor(profile)`.
- gentle-ai upgrade: converge the repo + host commands, if the verdict is to upgrade.
- Angular CLI MCP (`ng mcp`) evaluation -> host item if adopted.
- B7 — lessons for this session's real bugs via `capture.mjs`, each with its anti-recurrence mechanism;
  the three named by the owner (reconcile order, duplicated stub, monolingual message) have no trace in
  either history: they need the owner's data, never invented.
- A3 — closure doc: CLOSED/DROP per item with proof; old-plan checkboxes retired.
- Owner premises register — every mandate and premise stated in the conversation, judged (keep / amend /
  drop) with evidence.
- C2 — one final full run of both repos.
- Deep multi-agent audit of both repos (owner premises judged too) -> fix findings -> verdict.
- Post-audit research (official Anthropic docs and repos) for further gains in quality, speed and token
  use -> implement.
- Final list to the owner: done + host-only (`host-backlog.md`).
