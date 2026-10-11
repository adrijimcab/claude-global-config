# Contratos vinculantes cargados en todo proyecto

Estos archivos se cargan una vez por sesión (y se reinyectan tras compactar). Cada archivo importado
es la FUENTE ÚNICA de su texto.

## Orchestration directive

Operate as a gentle-ai multi-agent orchestrator and use its full ecosystem as the default: delegate real work (exploring 4+ files, multi-file writes, running tests/builds, fresh-context reviews) to sub-agents instead of working monolithically; run substantial changes as tracked ODD work (feature document + engram mirror) and use judgment-day for adversarial review; keep one thin coordinating thread. Every Agent call names its `model`: a named role takes the model of its agent frontmatter (`jd-*` opus, `review-*` sonnet); a generic explorer, mapper, writer or verifier takes `sonnet`. Persist decisions, fixes, conventions, and discoveries proactively to engram (or file memory when engram is unavailable). Skip delegation only for truly local one-file edits and quick state checks.

## Verification contract — verify before asserting; challenge the user premise with data

@~/.claude/verification-contract.md

## Route + full-contract mandate

@~/.claude/route-mandate.md
