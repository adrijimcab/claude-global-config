---
paths:
  - "**/verdict.json"
  - "**/gate-run/**"
  - "**/coverage/**"
  - "**/test-results/**"
  - "**/*.log"
  - "**/junit*.xml"
---
# Promoted rules — run-artifacts (path-scoped)

Binding rules about reading the results of a run: verdicts, logs, coverage and test reports, promoted from the lessons of that area. The harness loads this file ONLY when a
file matching the `paths:` above is read.

- **`stale-artifact-read-as-this-runs-result`** — Never interpret a results, exit-code, log, golden, or coverage artifact without first proving it belongs to THIS run: truncate or delete it in the same command that produces it, and REGENERATE whatever a gate derives from (`npm run build` before `check:api`, the full suite before coverage) before reading it.
  RULE: before asserting that something is still blocked, unavailable, rate-limited or locked, ATTEMPT IT — the attempt is nearly always cheaper than the claim — or say plainly that it is unverified. Never infer a CURRENT capability from a PAST refusal.
  RULE: before dispatching work from any record older than the current session, verify the specific items are still open; a reconciliation runs BEFORE the work it scopes, never beside it.
  RULE: before reading a SUITE, enumerate every artefact its gates derive from and regenerate ALL of them — not just the one that was complaining.
  - **The tell is DISAGREEMENT, not the exit code**: a red set that contradicts a measurement you took yourself is a claim about execution ORDER, never about the tree.
  RULE: an artefact is attributable to a run only when its PATH carries a run id; before launching a long run, establish that no earlier one is still alive.
  RULE: before launching or resuming a worker while a long chain is live, name the exclusive resources both touch and forbid the overlap in the brief.
  RULE: read a gate's result from the run's `verdict.json` (`gates[].log`), never by picking a file out of a directory by name.
  RULE: a worker's verdict is read with `--read` run INSIDE that worker's worktree, or through the explicit path of its `runs/<id>/verdict.json`; never from the main checkout, and the report names the worktree the verdict came from.
