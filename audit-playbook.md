# AUDIT PLAYBOOK — minimum standard for EVERY project audit (owner directives, consolidated 2026-07-19/20)

Binding baseline for any "auditoría completa/exhaustiva" on any project. The project may ADD rules; it may not subtract these.

## 1. Verification discipline (non-negotiable)
- Every claim ships a `file:line` receipt or the command + exit code in the SAME message. No receipt = not a claim.
- Negative/absolute claims ("no existe", "nunca", "todos") require running the search that WOULD have found the thing, and stating it.
- External audits handed in by the owner are VERIFIED claim-by-claim against disk before entering the report: verdict per item (CONFIRMED / PARTIAL / REFUTED / OBSOLETE), with receipts. Refutations are stated plainly; when the external auditor was right and the coordinator was wrong, say "I was wrong" with the evidence and record the root cause of the error.
- Gates are RUN (read-only) when claims depend on them — never assumed green from memory. Gate output goes to a file and is Read.
- Line-by-line reading within scope, not sampling. When a count matters, count on disk.

## 2. Fleet orchestration
- Audit agents are STRICTLY READ-ONLY: no edits, no creates, no staging, no commits. State it in the first line of every brief.
- Children never spawn agents. Parallel fan-out by children has exhausted session limits twice — forbidden.
- Dead agent → try SendMessage resume FIRST ("resume exactly where you left off"); fresh relaunch only if resume fails; 0-KB transcripts = fresh directly.
- Every fresh brief carries a "KNOWN FINDINGS — do not re-derive" section with everything already proven, so paid work is never repaid.
- On session-limit storms: sequential recovery (one at a time, next only after one COMPLETES); canary before fanning out.
- Every agent report is persisted VERBATIM-condensed to disk (scratchpad audit-reports/) the moment it arrives — context compaction must never lose findings.

## 3. Master index contract
- One `00-MASTER-INDEX.md`: every source listed with status; "nothing ships to the final report unless listed here".
- Owner mandates (M1..Mn) registered as first-class workstreams the moment they are given, each verified inline against disk before registration (premise-check: size the real gap, challenge false premises with data).
- A RELEASE ACCEPTANCE CONTRACT ("Definition of 10"): zero open findings, deferral labels banned, conventions resolved library-wide AND enforced by lint rule or gate (enforced, not remembered), coverage thresholds are a floor that never rises while real coverage trends to ~100% (lib + plugins + demo + SSR paths).

## 4. Standing technical premises (apply to every project unless owner overrides)
- Senior architect / CTO mode: root-cause solutions only; no fixes, patches, workarounds, suppressions; tradeoffs stated BEFORE acting; pre-existing debt found in the path is IN SCOPE.
- Regex mandate: never parse structure (code, templates, styles, JSON, paths, URLs) with regexes — typed parsers that FAIL LOUDLY (compiler APIs, ASTs, JSON.parse). A non-matching regex skips silently; a parser that cannot parse THROWS. Consumer-facing seams where RegExp is the domain contract are explicit, allowlisted, owner-decided. Enforcement = lint rule banning raw regex outside the allowlist.
- Bilingual artifact policy where the project uses it: English primary + @es neutral Spanish (proper ñ/accents); throw/console English-first.
- Every convention inconsistency found → resolved everywhere + a rule/gate so it cannot regress.
- Docs are living sources: hardcoded counts must be derived or gated; every doc-rot finding names the missing GATE, not just the wrong text.
- Testing bar: 100% real coverage target without raising thresholds; E2E with real interaction + console errors AND warnings as failures + performance budgets over both the showcase (Storybook) and the demo app; a11y gates must scan overlay/portaled DOM, not just the inline root.

## 5. Final report format — CTO BLUEPRINT
- Grouped by ADDRESSABLE THEME (workstreams), not by which agent found what; within each theme ordered most-critical → lowest.
- Merges: coordinator audit + validated externals + owner mandates + explicit answers to EVERY question in the owner's original prompt (own section per question).
- Architectural solutions only, each with design, tradeoffs, and the gate/rule that locks the fix in.
- The blueprint is the release CLOSE-OUT LIST, not an informational report: implementation agents receive it via the project ledger/hook (deterministic injection, never memory).

## 6. Delivery mechanics
- Findings and decisions persisted to project memory as they happen (checkpoints survive session death).
- Implementation phase: writers get the ledger contract injected (senior mode, debt-in-scope, regex mandate, Definition of 10); every fix branch goes through the bounded review lifecycle (lens by risk); convention fixes land WITH their enforcement rule.
