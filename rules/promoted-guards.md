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
# Promoted rules — guards (path-scoped)

Binding rules about writing or changing a guard, gate, check or classifier, and the tests and mutation campaigns that prove it, promoted from the lessons of that area. The harness loads this file ONLY when a
file matching the `paths:` above is read.

- **`guard-that-cannot-go-red`** — A new guard, gate, check or classifier is NOT trusted until it has been proven to DISCRIMINATE, on real cases, across the state space its decision ranges over.
  RULE: enumerate the state space the decision ranges over and exercise each state in the self-test, so the discrimination cannot silently drift back.
  RULE: test the near miss, and make the refusal NAME it — do not relax the form to make the message unnecessary; strictness is what stops a marker from being talked around.
  RULE: a fixture is CONSTRUCTED by the test, never read from a branch, a tag's relationship to a branch, or any artifact that legitimately changes.
  RULE: before any probe becomes a decision signal, exercise the state in which it MUST say no — a borrowed signal gets the same scrutiny as a guard you wrote.
  RULE: name the question the action decides, in words, BEFORE choosing the probe; when a decision has two independent preconditions, satisfying one is not evidence about the other.
  RULE: when a guard forbids a token, its self-test must exercise that token appearing as DATA — heredoc bodies, quoted strings, echoed text, commit messages — and must prove the scan RESUMES afterwards.
  RULE: an identity guard compares what the author actually wrote (the brief, not the label), folds the domain's own spellings, and treats a live worktree as overriding recency; where the signal is too weak to refuse, it must still surface the candidate.
  RULE: a value measured in one unit is applied in that unit — a byte size cuts bytes, never a decoded string; a fixture is chosen for the data the guard will really read.
  RULE: the completion of a multi-item operation is verified by COUNTING what landed against what was asked, never by a state flag; prefer the tool that already owns the operation.
  RULE: a kill measured over a red baseline is not evidence, and a proof is only as good as the runner's ability to refuse to measure.

- **`live-ledger-lines-dropped-by-landing`** — enforced by `worktree-landing/ledger-retention.mjs` (land.mjs refuses).
  RULE: Before a landing that resets the live ledger, the branch carries every live ledger key at its live count (replayed through capture.mjs in the branch, or the landing waits); a landing never leaves the live ledger with fewer keys or lower counts than before.

- **`tree-written-during-its-full-chain`** — enforced by `full-chain-lock/write-guard.mjs`.
  RULE: while a full chain runs in the background, write nothing in the tree under test or in TEMP/claude; queue those edits until its verdict is read.

- **`vendored-copy-edited-in-place`** — enforced by `vendored-edit-guard/guard.mjs`.
  RULE: a vendored module changes only at its b100 source followed by vendored sync; the landing of ~/.claude runs vendored check and refuses EDITED IN THE KIT

- **`worker-subdelegated-past-the-concurrency-cap`** — enforced by `worker-delegation-guard/guard.mjs`.
  RULE: every brief states 'do not spawn sub-agents; if the work is too large, report the partition and stop', and the orchestrator splits large campaigns itself within the cap.

- **`worker-work-left-uncommitted-across-a-stop`** — enforced by `commit-cadence-guard/guard.mjs`.
  RULE: the orchestrator runs a periodic snapshot of every live worktree's uncommitted diff and untracked files outside the tree, and checks commit counts at every worker notification.

- **`user-facing-prose-leaked-into-a-worker-brief`** — enforced by `brief-audience/guard.mjs`.
  RULE: the user-facing reply is written only AFTER every tool call in the turn is closed, never inside one. Before sending any brief, the last thing in the prompt must be an instruction to the worker -- if the final paragraph addresses anyone but the worker, the block is malformed and must not be sent. And when it happens anyway, correct the live worker immediately and name which part to discard rather than hoping it ignored it.

- **`wall-time-asserted-as-concurrency-proof`** — enforced by `wall-time-proof/tree.selftest.mjs` (scans every selftest for an asserted elapsed wall time).
  RULE: Concurrency is proved by a condition that holds only when the units overlap (a meeting of marks with a deadline), never by a wall-time bound, and the near miss run one at a time is shown red.
