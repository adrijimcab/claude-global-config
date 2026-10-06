---
name: frontend-audit
description: >
  Audits a frontend JS/TS repository end to end: runs the project's own gates for its real version, then
  /code-review and /security-review, and records every finding with its receipt in the per-repository
  findings register (.claude/FINDINGS.jsonl). Only on explicit invocation.
disable-model-invocation: true
argument-hint: "[scope: path or branch; default the whole repository] [effort: low|medium|high]"
---

# Frontend audit

An audit READS and RECORDS; it never fixes in the same run (fixes are separate, reviewed changes). Nothing is
suppressed to make it pass (owner mandates: zero suppression).

## 1. Measure the project

1. `node ~/.claude/project-profile/profile.mjs --json` in the repository root: framework and major, TypeScript,
   runners, package manager, support status. An EOL or near-EOL Angular major is itself finding #1
   (security posture), with the date from the profile line.
2. Read `.claude/AGENT-CONTRACT.md` (G3 lists the gates and the full-chain command) and `package.json`
   scripts. No contract: the gates are the project's lint, type check, unit tests with coverage, production
   build with budgets; their absence is a finding.
3. Rules for judging the code are the version-gated ones: `~/.claude/rules/fe-*.md` and the version file the
   profile line names. An API that is EXP/DP in the project's major and in use is a finding, not a style note.

## 2. Run the gates (each one alone, real exit code)

Run every gate of the contract once, in its order, the build before the gates that derive from it, each with
its output to a log file and its exit code read from the process (never from a printed `$?`). For each gate:
the command, the exit code, the log path, and the count of problems. A gate that cannot run (missing
toolchain, missing script) is a finding with basis `measured` and the failing command as its receipt.

Then the static scans the project does not have yet, chosen from `~/.claude/gates-kit/tier1-tier3-menu.md`
(Tier 1 first: secrets, dependency CVEs with the project's package manager audit, strict TypeScript, template
a11y lint). They run read-only against the tree; their config is not committed by the audit.

## 3. Review

- `/code-review` on the scope (the argument; default the default branch's tree) at the requested effort.
- `/security-review` on the same scope.
- Both outputs are candidates: each one is verified against the code before it becomes a finding (a review
  claim without a confirmed location is recorded as `--basis hypothesis`, never as measured).

## 4. Record

Every confirmed problem goes to the register, one `add` per finding, English and Spanish summaries, at least
one receipt:

```sh
node ~/.claude/gates-kit/findings-register.mjs add --scope <repo or path> --source <gate | code-review | security-review | profile> \
  --basis measured --en "<what is wrong, where>" --es "<lo mismo en español>" \
  --cmd "<command>" --exit <code> --path <file:line> --measurement "<number and unit>"
```

`list` shows the open findings; `validate` checks the register. The register is not an exception list: an open
finding never turns a gate green and is closed only by a `close` entry with its own receipt.

## 5. Report

One table: finding id, source, severity (security > correctness > version/support > maintainability), file,
receipt. Then the gates table (command, exit code, problems). Then what was NOT checked and why (no running
app for Lighthouse/axe, no network for the audit, a gate missing). The owner decides what gets fixed; each
fix is its own change through the normal route.
