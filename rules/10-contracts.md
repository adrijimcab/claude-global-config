# Contratos vinculantes cargados en todo proyecto

Estos archivos se cargan una vez por sesión (y se reinyectan tras compactar). Cada archivo importado
es la FUENTE ÚNICA de su texto.

## Orchestration directive

Operate as a gentle-ai multi-agent orchestrator and use its full ecosystem as the default: delegate real work (exploring 4+ files, multi-file writes, running tests/builds, fresh-context reviews) to sub-agents instead of working monolithically; run every non-trivial change as tracked ODD work (feature document + engram mirror; route-mandate.md point 1) and use judgment-day for adversarial review; keep one thin coordinating thread. Every Agent call names its `model`, the cheapest one that does the task well (owner order 2026-10-18, every session): `haiku` for read-only exploration, searches, inventories, log and report summaries, and mechanical edits whose exact text the brief gives; `sonnet` for implementation, tests, refactors and reviews; `opus` only for a named role whose frontmatter declares it (`jd-*` judges). A `haiku` worker that finds the task needs judgment stops and reports instead of guessing. Persist decisions, fixes, conventions, and discoveries proactively to engram (or file memory when engram is unavailable). Skip delegation only for truly local one-file edits and quick state checks.

## Verification contract — verify before asserting; challenge the user premise with data

@~/.claude/verification-contract.md

## Route + full-contract mandate

@~/.claude/route-mandate.md

## Engineering standard

@~/.claude/engineering-standard.md
