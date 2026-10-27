# Host backlog — work that only the owner's machine can do

Items that the cloud session that built them could not run, because they need the owner's Windows host,
its live `~/.claude` state, real sessions, or an install. Each item names the exact command and the
evidence that closes it. Close an item by replacing `OPEN` with `CLOSED <date> — <evidence>`.

@es Trabajo que solo puede hacer la máquina del dueño: cada ítem nombra el comando exacto y la evidencia
que lo cierra. Se cierra cambiando `OPEN` por `CLOSED <fecha> — <evidencia>`.

Host run of 2026-10-11 (read-only verifier, after pulling both repos): its results are written under each
item below. H1-H6 reached the host as headings with no command and no closing evidence, against this
file's own rule; the commands measured that day are recorded here so each item can be closed.
@es Corrida en el host del 2026-10-11 (verificador de solo lectura, tras traer los dos repos): sus
resultados van bajo cada ítem. H1-H6 llegaron al host como títulos sin comando ni evidencia de cierre;
aquí quedan los comandos medidos ese día.

## H1 — Rotate the registries polluted by test data (A6) — OPEN

Host 2026-10-11: `node $HOME\.claude\hook-state\rotate.mjs --dry-run` exit 0, plan 34 ARCHIVE / 369 KEEP;
37 KEEP entries are selftest litter (`backlog-guard/selftest-*.json`, `s-1.json`) the plan would keep, and
`--apply` is refused while live sessions are registered (two were). Blocked by master-backlog R2: the
rotate selftest cannot run on this host (symlink EPERM) and its campaign does not exist, so `--apply` is
unproven. A verified backup of the journals as of 2026-10-04 exists in
`~/.claude-backups/journals-2026-10-04` (27 files). Closes with: R2 green, no live session, `--apply`,
then `node $HOME\.claude\guard-precision\report.mjs` showing 0 unclassified lines.

## H2 — Verify `omitClaudeMd` keeps `~/.claude/rules/` in a worker — OPEN

Not run on 2026-10-11. No command was recorded for it.

## H3 — Install the `typescript-lsp` plugin — OPEN

Not run on 2026-10-11 (an install needs the owner's go).

## H4 — Host hygiene: node_modules links, engram conflicts, `.md.bak`, PATH (B9) — OPEN

Host 2026-10-11: bat, fd, sd and eza resolve on PATH in a fresh shell; no `agents/*.md.bak` exists.
Still open: the node_modules link check and the pending engram conflicts (not measured that day).

## H5 — A/B with a real task: full config vs. a short CLAUDE.md (C1) — OPEN

Not run on 2026-10-11. Measure wall time, defects found at review, and quota used, on one real task.

## H6 — Real turn-close timings on Windows (B1 target ≤ 300 ms) — OPEN

Host 2026-10-11: `node $HOME\.claude\hook-dispatch\replay.mjs latency --manifest
$HOME\.claude\hook-dispatch\manifests\stop.json --runs 20` exit 0, 0 failed runs, median 726.2 ms, p95
787.4 ms, 4 live transcripts (118.6 MB); the result carried no repo scenario (`"repos":[]`), so clean and
dirty were not told apart. Baseline 2026-10-04: 1,606.7 / 1,940.6 ms with 14 live transcripts. Closes with
a median at or under 300 ms on a run that names the clean and the dirty scenario.

## H7 — rtk (Bash output compressor) — DROP

Verdict 2026-10-06, from rtk's source (v0.49.0, commit eb225a1) and code.claude.com/docs/en/costs and
tools-reference: rtk rewrites whole command chains but keeps redirects, so `cmd > out.txt 2>&1` logs the
FILTERED output and grepping the log for errors stops proving anything; its vitest filter drops
file-level import/collection errors and stderr; it covers Bash only (not PowerShell); parallel guards
judge the original command, not the rewritten one; it bypasses permission prompts by design; its
changelog carries a long run of swallowed-failure fixes. Adopted instead: the project-owned summarising
gate runner (full log with `EXIT=` inside, verdict line, capped failure excerpt, log path).

## H8 — One week of the premise judge (prompt Stop hook): latency and false-block rate — OPEN

The `type: "prompt"` Stop hook of `premise-judge/` (rubric in `premise-judge/prompt.mjs`, wired in
`settings.json`) calls a model on every turn end. Measure it for seven days from the day it lands on the
host (`<D>` below, `YYYY-MM-DD`), with real sessions. Every command runs in PowerShell or Git Bash.

1. Latency it adds: `node "$HOME/.claude/premise-judge/latency.mjs" --since <D>`. Record `withJudge`,
   `judgeMs` and `addedMs` (median, p95). If `withJudge` is 0 and `labelsSeen` is printed, the transcript
   labels the prompt hook differently from the assumed `PROMPT_SIGNATURE`: fix the matcher from the labels
   shown and re-run; that does not close the item.
2. Its blocks reach the journal: `node "$HOME/.claude/guard-precision/report.mjs" --json`, row
   `premise-judge` (`blocks`); `$HOME/.claude/premise-judge/state/fires.json` counts the stops it judged.
   A `PREMISE-JUDGE:` feedback seen in a session with `blocks` still 0 means the feedback record shape
   assumed by `premise-judge/journal-guard.mjs` is wrong (UNVERIFIED in the cloud): fix it first.
3. Label a random sample: `node "$HOME/.claude/guard-precision/label.mjs" --mechanism premise-judge`
   prints up to 10 blocks; judge each with `node "$HOME/.claude/guard-precision/label.mjs" --mechanism
   premise-judge --correct <blockId>` or `--false <blockId>`. Do the same for `--mechanism hooks` (the
   claim guard, whose blocks now include the attributed-premise class). Re-run step 2's report: it prints
   `falseBlockRate` and its Wilson interval once 10 sampled labels exist.

**Retire the prompt hook** (delete its `settings.json` entry, keep the journal, paste the figures here)
if ANY of these holds at the end of the week:

- `addedMs` median > 1500 ms or p95 > 5000 ms. The whole turn-close budget of the deterministic hooks is
  300 ms (H6); a model call cannot meet it, so the exception is capped at 5× that budget on a typical turn,
  and at the point (5 s) where one turn in twenty stalls long enough to read as a hang.
- `falseBlockRate` > 0.20 with ≥ 10 sampled labels. Each false block costs one wasted model continuation,
  and a guard that is wrong on one block in five gets ignored or switched off, which is worse than no guard.
- Zero `correct` sampled blocks. Paying latency on every turn for no catch the claim guard did not already
  make is cost without benefit.
- Fewer than 10 blocks in the week: extend one more week; if still fewer than 10, retire it, since a judge
  that blocks that rarely cannot repay a model call on every turn.

Close with `CLOSED <date> — kept|retired: addedMs median/p95, falseBlockRate (n), correct blocks`.

## H9 — gentle-ai v4: decide SDD -> ODD before any upgrade — OPEN (decision: owner)

Verdict 2026-10-06: stay on 2.9.1. v4.0.0 (2026-10-01, commit e219644b) retires SDD for ODD; it is a
workflow change, not a version bump. Measured in an emulated home: always-loaded set 64,535 -> 87,524
chars with the overlay (over the 66k global target); v4 keeps the `sdd-preflight-hook` UserPromptSubmit
entry, which then exits 1 on every prompt; the 8 review/jd agents are frozen by v4's ownership file; SDD
commands the leftover skills call are "unknown command". The overlay itself converges under v4 (19/19
customizations, idempotent). Re-assess at the later of 2026-11-15 or a v4.x patch release at least 30
days old. If the owner chooses ODD, it is a port (rewrite `sdd-mandate.md`, delete SDD agents/skills/
commands, drop the preflight hook, delete the 8 review/jd agents before the first v4 sync, lazy-load
ODD's reference text, decide on ODD's automatic work-unit commits vs the commit guards), then:

```powershell
go install github.com/gentleman-programming/gentle-ai/v4/cmd/gentle-ai@v4.0.0
gentle-ai sync --dry-run
node $HOME\.claude\gentle-ai-overlay\sync.mjs
# rollback
go install github.com/gentleman-programming/gentle-ai/v2/cmd/gentle-ai@v2.9.1
git -C $HOME\.claude checkout -- .   # or restore ~/.gentle-ai/backups/<id>
```

@es Quedarse en 2.9.1: la v4 cambia SDD por ODD (decisión del dueño), sube el set siempre cargado a 87,5k
y deja un hook que falla en cada prompt. Se revisa en la fecha indicada.

CLOSED 2026-10-12 — H9 — gentle-ai v4: decide SDD -> ODD: the owner chose ODD and ordered the install.
The port landed on master (4886719; sdd-mandate.md -> route-mandate.md, SDD agents, skills and commands
removed, preflight hook dropped, spans lazy-loaded), `go install …/v4/cmd/gentle-ai@v4.0.0` exit 0,
`migrate-v4.mjs --apply` exit 0 with 5/5 checks held and rollback point
`~/.gentle-ai-migrations/v4-20261012T112049-688Z`, v4 settings render landed d1c6b04. Still open from
this item, carried to the master backlog: the always-loaded budget (last step), and receipt-driven
development, which v4 turns on by default (owner's switch).
@es CERRADO 2026-10-12: el dueño eligió ODD y ordenó instalarlo; el port y la instalación están hechos.

## H10 — Karma gate and Angular 22 Node floor on the host — OPEN

The Karma coverage gate of the angular-19..22 toolchains could not run in the cloud (no Chrome; the
browser download host is refused), and Angular 22 needs Node >= 22.22.3. On the host, for each N in
19 20 21 22: `node $HOME\.claude\gates-kit\verify.mjs --toolchain angular-N` (see its header for the
stack argument). Closes with every gate correct (green on pass fixture, red on fail fixture).

Host 2026-10-11: not runnable yet. `~/.claude-toolchains/` holds only `angular` (the unversioned package
`gates-kit-angular-toolchain`, installed 2026-10-05); the manifests are `angular-19`, `angular-20`,
`angular-21`, `angular-22`, `nest`, `node-vitest`, and `verify.mjs --toolchain angular-N` refuses (exit 2)
unless the installed package is the versioned one. The host runs Node v22.22.0, under Angular 22's floor of
22.22.3. Needs first: one pinned `npm install` per manifest into `~/.claude-toolchains/<name>` (the owner
authorised nest and node-vitest on 2026-10-05; the four versioned Angular ones were not asked), a Node
update for Angular 22, and removal of the unversioned `angular` directory once its replacement is green.

## H11 — Vendored check against the real owner checkout — OPEN

The vendored source (`~/Desktop/Projects/b100-am-ui/.claude`) exists only on the host. After pulling both
repos: `node $HOME\.claude\vendored\vendored.mjs check`; if SOURCE MOVED ON, `... sync` then commit.
Closes with 25 modules, 0 failures.

Host 2026-10-11: exit 1, 25 modules, 3 failures, and the verdict is EDITED IN THE KIT (not SOURCE MOVED
ON) for `mutation-proof/mutants.mjs`, `mutation-proof/scope.selftest.mjs` and
`mutation-proof/scope.mutants.mjs`. Do not `sync` (it would overwrite the kit edits): diff each against
the b100 source, move the edit to the side that owns the engine, then re-pin. Tracked as master-backlog R1.

## H12 — Selftests that need a symlink privilege the owner's Windows user lacks — OPEN

Host 2026-10-11: `hook-state/rotate.selftest.mjs:116` and `project-profile/selftest.mjs:476` fail with
`EPERM: operation not permitted, symlink`, so the whole runner is red (95 of 109) and nothing can land from
the host. The fix is in the repository (fixtures built with a junction or a constructed directory), not on
the host: tracked as master-backlog R2. Closes with `node $HOME\.claude\selftest-runner\run.mjs --root
$HOME\.claude` exit 0 on this host.

## H12 — Discovery: replace the junction instruction in its agent contract — OPEN

`junctioned-node-modules-broke-vitest-coverage` (P1-6, landed 95f0db3 in b100 and ae64d8e here). In the
Discovery repository, `.claude/AGENT-CONTRACT.md:157` §4 still tells agents to junction `node_modules` from
the main checkout. Replace it with: "Give the worktree its dependencies with `node
~/.claude/worktree-install/worktree-install.mjs provision --main <main checkout> --worktree <worktree>`:
its own `npm ci` by default, a junction to the main checkout's tree only once this project's own runner
passed the coverage probe through it (`junctioned-node-modules-broke-vitest-coverage`). Never junction
`node_modules` by hand, and never hard-link it." Then run the Discovery Karma probe once (needs Chrome).
Also unblocked for Discovery after `git pull` of ~/.claude: P1-5 (`holderOf`, b167bce) — a takeover brief
with `TENANCY: <worktree> — taking over…` of an unresumable holder is no longer refused by orphan-work.
