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
- [guards] 2026-10-26 — RULE: A spec awaits the condition it depends on (the observable decision as a Promise, whenStable, a harness wait, fakeAsync with tick for owned timers), never a setTimeout; a lint rule that refuses setTimeout-based waits in spec files is the mechanism. Evidence: lessons/evidence/spec-waits-on-a-timer-not-a-condition.md <!--fc:spec-waits-on-a-timer-not-a-condition#1-->
- [guards] 2026-10-18 — RULE: A mutation break run uses a dev server without live reload (ng serve --live-reload=false) and starts only after a new clean 'bundle generation complete' with no new ERROR line; a break that does not compile is invalid, never a result. Evidence: lessons/evidence/mutation-break-run-on-live-dev-server.md <!--fc:mutation-break-run-on-live-dev-server#1-->
- [guards] 2026-11-04 — RULE: Before changing code to turn a red test green, verify that the test states the truth: reproduce its input on a minimal case and check the fixture and the expectation; when the test is wrong, fix the test and add a case that pins the correct behaviour. Evidence: lessons/evidence/red-test-trusted-over-the-code.md <!--fc:red-test-trusted-over-the-code#1-->
- [guards] 2026-11-04 — RULE: A mutant run and its baseline run in the same environment, and every private TEMP a runner gives a child lives outside any git repository (under the OS temp root), so a parallel verdict means what the serial one means. Evidence: lessons/evidence/mutant-pool-temp-inside-a-git-tree.md <!--fc:mutant-pool-temp-inside-a-git-tree#1-->
- [guards] 2026-11-04 — RULE: A runner gives a pooled child the same stdio as its serial baseline (stdin ignored or ended at once), and a near-miss selftest that reads stdin proves the pooled run ends. Evidence: lessons/evidence/mutant-pool-stdin-left-open.md <!--fc:mutant-pool-stdin-left-open#1-->
- [guards] 2026-11-04 — RULE: Concurrency is proved by a condition that holds only when the units overlap (a meeting of marks with a deadline), never by a wall-time bound, and the near miss run one at a time is shown red. Evidence: lessons/evidence/wall-time-asserted-as-concurrency-proof.md <!--fc:wall-time-asserted-as-concurrency-proof#2-->
