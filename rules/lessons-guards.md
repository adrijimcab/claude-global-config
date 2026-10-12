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
- [guards] 2026-10-12 — RULE: an observer must not change what it observes; a gate that goes red only under observation invalidates its record (b100 gate-scope now refuses such a record), and the fix removes the interfering hook rather than excusing the gate. Evidence: lessons/evidence/observer-altered-observed-gate.md <!--fc:observer-altered-observed-gate#1-->
- [guards] 2026-10-12 — RULE: a change to selftest discovery is proven against every project tree that declares selftests (b100 .claude: 59) before it lands. Evidence: lessons/evidence/selftest-discovery-missed-ignored-subfolders.md <!--fc:selftest-discovery-missed-ignored-subfolders#1-->
- [guards] 2026-10-11 — RULE: a denylist names what it forbids, never a generic phrase; before a term enters a blocking list, grep the real trees it will gate and read every hit. Fixed on land/checkpoint-5 c2b0cac. Evidence: lessons/evidence/blocking-term-list-drafted-from-one-incident.md <!--fc:blocking-term-list-drafted-from-one-incident#1-->
