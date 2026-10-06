---
paths:
  - "**/*.selftest.mjs"
  - "**/selftest.mjs"
  - "**/*.mutants.mjs"
  - "**/mutants.mjs"
  - "**/guard.mjs"
  - "**/*-guard/**"
  - "**/*.spec.*"
  - "**/*.test.*"
---
# Lessons Ledger — guards (path-scoped)

Lessons about writing or changing a guard, gate, check or classifier, and the tests and mutation campaigns that prove it. The harness loads this file ONLY when a file matching the `paths:` above is read.
One line per RULE (a repeat folds into its line and bumps the counter). Machine state: the trailing `<!--fc:KEY#N-->`
marker belongs to `~/.claude/failure-capture/`; this file is written only by `capture.mjs`, never by hand.

---

- [guards] 2026-07-20 — RULE: guards for derived/generated artifacts must detect STALENESS via a content fingerprint of the generator's INPUTS (regenerate when inputs change), never presence-only and never mtime (unreliable across checkouts). Evidence: lessons/evidence/derived-artifact-regenerated-only-when-absent.md
