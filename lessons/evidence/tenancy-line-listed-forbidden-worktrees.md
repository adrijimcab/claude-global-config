# `tenancy-line-listed-forbidden-worktrees` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-18 (captured)

- [global] 2026-10-18 — 2026-10-18 session di-1700002-discovery-fe-11 wrote a worker brief whose TENANCY line also listed the worktrees the worker must NOT touch (chain, frame, icons, net, pdt); the fleet-kit tenancy guard then refused push-commit's commits and worktree removals there -> root cause: brief-tenancy/tenancy-declaration.mjs:117 declarationOf matches any checkout name as a substring of the whole TENANCY line, and agent-liveness/liveness.mjs:234 uses it for ownership, so a forbidden list reads as a claim RULE: A TENANCY line carries only the worker's own worktree path; any list of forbidden worktrees goes on its own line, until the parser matches the declared path instead of a substring. <!--fc:tenancy-line-listed-forbidden-worktrees#1-->
