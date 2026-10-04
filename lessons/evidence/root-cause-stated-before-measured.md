# `root-cause-stated-before-measured` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-04 (condensed)

- [global] 2026-10-01 — I told the owner that capture.mjs init resolved the home as a project and wrote the CLAUDE.md section; the worker measured on constructed and real homes that the home resolves to no project and that the home-stop was on master since 635ca83 -> root cause: I read the code path that writes the section and inferred the resolver behaviour without running it, then relayed the inference as the root cause while the backlog still marked it HYPOTHESIS -> RULE: a root cause reaches the owner only after the failing behaviour is reproduced on constructed state; until then it is named a hypothesis in the same sentence. <!--fc:root-cause-stated-before-measured#1-->

## Ledger line archived 2026-10-04 (promoted)

- [global] 2026-10-01 — RULE: a root cause reaches the owner only after the failing behaviour is reproduced on constructed state; until then it is named a hypothesis in the same sentence. Evidence: lessons/evidence/root-cause-stated-before-measured.md <!--fc:root-cause-stated-before-measured#2-->

Promoted 2026-10-04 to ~/.claude/rules/promoted-rules.md; no mechanism is possible: Whether a prose sentence asserts a code behaviour, and whether that behaviour was reproduced, cannot be decided from the text (same measured class as brief-tenancy). In its place: the brief skeleton (MEASURED lines carry their command, everything else HYPOTHESIS) and a candidate brief-lint rule built only if task 2.7b proves it discriminates on real briefs.
