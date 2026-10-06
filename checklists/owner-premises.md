# Owner premises register

Every instruction and premise the owner stated in the 2026-10-06 sessions, judged as a senior architect
would: KEEP (correct as stated), AMEND (right goal, wrong mechanism or scope), DROP (wrong). Initial
verdicts; the deep audit re-judges them with evidence. The owner asked for exactly this: "no siempre tengo
razón".

@es Cada instrucción y premisa del dueño, juzgada: KEEP (correcta), AMEND (objetivo bueno, mecanismo o
alcance no), DROP (incorrecta). Veredictos iniciales; la auditoría los revisa con evidencia.

| # | Premise | Verdict | Why |
|---|---|---|---|
| 1 | Architectural solutions, never fixes or patches | KEEP, AMEND | Right as a bar; but the minimal change that removes the root cause IS the architectural answer — size is not the test, root cause is. |
| 2 | An item stays only if it fixes a measured, recurring or breaking problem | KEEP | It is what cut rtk, the A5 "as is" item and tooling bookkeeping. |
| 3 | A5: integrate the transcript index "as is" | DROP | No code existed in either repo; it is built inside B1. |
| 4 | Git process counter "to improve speed" | AMEND | A counter measures; it speeds nothing by itself. Kept as B1's instrument to find spawns to cut. |
| 5 | Push everything straight to master | KEEP, AMEND | Acceptable for two single-owner config repos only because every merge passes the full selftest run first (A2); never without that gate. |
| 6 | Read the full output of every gate | DROP | Wastes tokens and Claude Code truncates long output anyway; replaced by the summarising runner (full log on disk, verdict + capped failure excerpt on screen). rtk rejected too (H7). |
| 7 | "Use the latest of the latest" | AMEND | Latest STABLE that the project's major supports; never a pre-release, never TS 7 under Angular (outside every peer range). |
| 8 | 99% frontend JS/TS: legible, minimalist, audit-proof, efficient | KEEP | Implemented as path-scoped fe-* rules, per-major Angular skill and gates. |
| 9 | For ALL sessions and new projects, not only b100 | KEEP | User-level rules, profile hook, bootstrap skill. Open audit question: generic engines are still owned by the b100 project. |
| 10 | Practices, docs and gates follow the project's real Angular version (19-22) | KEEP | Profile -> per-major rules column, version file and toolchain. |
| 11 | Upgrade gentle-ai if possible | DROP (for now) | v4 replaces SDD with ODD, +22.8k chars per session and a hook failing every prompt (H9). |
| 12 | Every real bug gets a lesson AND a mechanism | KEEP | Vendored-edit guard, undeclared duplicates, journal producers, leak detector, supersede. |
| 13 | B7: lessons for three named bugs | AMEND | No trace in either history; writing them without evidence breaks the lessons contract. Needs the owner's data. |
| 14 | Canonical `.claude` structure from the image | AMEND | Item by item: `commands/` merged into skills; generic reviewer agents covered by /code-review, /security-review and plugins; `.mcp.json` and `CLAUDE.local.md` adopted per project (verdicts in `skills/project-bootstrap/references/structure-verdicts.md`). |
| 15 | Judge every premise, by hook, in all sessions | KEEP, AMEND | Deterministic layer (claim-guard) is free; the semantic Stop judge costs a model call per turn and is on trial (H8) with retirement thresholds. |
| 16 | Deep audit, then Anthropic research, then token-saving tools | KEEP | Queued in `master-backlog.md`. |
| 17 | Standing CLAUDE.md rules (no Co-Authored-By, bat/rg/fd/sd/eza only, short answers, one question at a time, verify claims) | KEEP, AMEND | All sound; "never use cat/grep/find/sed/ls" is host-specific — the tools are absent in cloud containers, so the rule must say "when installed". |
