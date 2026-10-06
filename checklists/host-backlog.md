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

## H7 — Bash/gate output compression (rtk or an alternative) — PENDING VERDICT

Being researched in this session; the verdict and its implementation replace this entry.
