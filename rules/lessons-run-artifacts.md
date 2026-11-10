---
paths:
  - "**/verdict.json"
  - "**/gate-run/**"
  - "**/coverage/**"
  - "**/test-results/**"
  - "**/*.log"
  - "**/junit*.xml"
---
# Lessons Ledger — run-artifacts (path-scoped)

Lessons about reading the results of a run: verdicts, logs, coverage and test reports. The harness loads this file ONLY when a file matching the `paths:` above is read.
One line per RULE (a repeat folds into its line and bumps the counter). Machine state: the trailing `<!--fc:KEY#N-->`
marker belongs to `~/.claude/failure-capture/`; this file is written only by `capture.mjs`, never by hand.

---

- [run-artifacts] 2026-10-27 — RULE: Before re-running any Playwright spec after a failed run, copy that run's failure artifacts out of test-results, or give the re-run its own --output folder. Evidence: lessons/evidence/e2e-artifacts-overwritten-by-rerun.md <!--fc:e2e-artifacts-overwritten-by-rerun#1-->
