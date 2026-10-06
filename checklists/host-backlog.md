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
