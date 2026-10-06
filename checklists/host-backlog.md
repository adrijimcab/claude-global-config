# Host backlog — work that only the owner's machine can do

Items that the cloud session that built them could not run, because they need the owner's Windows host,
its live `~/.claude` state, real sessions, or an install. Each item names the exact command and the
evidence that closes it. Close an item by replacing `OPEN` with `CLOSED <date> — <evidence>`.

@es Trabajo que solo puede hacer la máquina del dueño: cada ítem nombra el comando exacto y la evidencia
que lo cierra. Se cierra cambiando `OPEN` por `CLOSED <fecha> — <evidencia>`.

## H1 — Rotate the registries polluted by test data (A6) — OPEN

## H2 — Verify `omitClaudeMd` keeps `~/.claude/rules/` in a worker — OPEN

## H3 — Install the `typescript-lsp` plugin — OPEN

## H4 — Host hygiene: node_modules links, engram conflicts, `.md.bak`, PATH (B9) — OPEN

## H5 — A/B with a real task: full config vs. a short CLAUDE.md (C1) — OPEN

## H6 — Real turn-close timings on Windows (B1 target ≤ 300 ms) — OPEN

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
