# Promoted rules — delegation (on demand, NOT loaded)

Binding. The harness does NOT load this file; `~/.claude/rules/promoted-rules.md` names it and says when to read it: before writing a delegation brief, launching or messaging a worker, quoting a path or mechanism from a document, blaming a tool, or acting on a worktree, process or branch that is not yours. Read it IN FULL then. The full account of each key is in `~/.claude/lessons/evidence/<key>.md`.
@es Vinculante. El harness NO carga este fichero: `~/.claude/rules/promoted-rules.md` lo nombra y dice cuándo leerlo: antes de escribir un brief de delegación, lanzar o escribir a un worker, o actuar sobre un worktree, proceso o rama que no es tuyo. Leerlo ENTERO entonces.

- **`brief-marker-written-as-prose-not-literal-form`** — CLOSED BY MECHANISM 2026-09-09; this entry states the rule the mechanism enforces. A delegation brief must carry both provenance markers, and the check is: **the word `MEASURED` / `HYPOTHESIS` STARTS its own line, and that line carries a colon somewhere.** Guard `~/.claude/brief-provenance/guard.mjs`.
  RULE: every Agent prompt and every worker SendMessage is drafted FROM the skeleton — line 1 `MEASURED: …`, line 2 `HYPOTHESIS: …`, then the instruction — even a two-line resume; for a non-trivial brief run `node ~/.claude/brief-feasibility/preflight.mjs <draft>`, which runs every delegation guard in one pass, before sending.

- **`provisioning-bound-to-delegation-not-worktree-creation`** — A worktree you create YOURSELF arrives with no `node_modules`, because the provisioner is bound to DELEGATION (a `PreToolUse` hook on `Task|Agent`), never to worktree creation. **RULE: after any `git worktree add` you performed yourself, give the new worktree its dependencies BEFORE running a single gate there** — and never read a gate failure in a fresh worktree as a verdict about the code until `node_modules` is confirmed present.

- **`gitignored-deliverable-destroyed-by-worktree-autoclean`** — CLOSED BY MECHANISM 2026-09-16. **THE RULE, a shared predicate rather than a habit:** the question a removal decides is "if this worktree were deleted right now, what would be gone for good?", answered in ONE place (`.claude/worktree-work/worktree-work.mjs`) that every consumer asks. **Anything ignored and UNDECLARED counts as work** — a path is exempt only where a declaration names the process that produces it.

- **`brief-contradicted-a-standing-project-rule`** — A brief I write outranks nothing: the project's standing rules do.
  RULE: before fixing the FORM of a deliverable in a brief (commit shape, language, where it lands), check it against the project rules for that area; never extend a rule to a surface it does not name from a guess (apply its evident intent or ask); and never relay an unmeasured worker claim as the basis of a brief.

- **`instructed-a-worker-to-run-a-denied-command`**
  RULE: before any command goes into a brief, check it against the worker's real environment (deny list, blocking hooks, its pinned worktree) and name the alternative that works. A worker never changes worktree: moving work onto a new base is the orchestrator's step (cherry-pick into the new worktree from the main checkout), followed by a worker whose TENANCY names that worktree from launch. Every tooling command in a brief uses the main checkout's ABSOLUTE path. Mechanism: `~/.claude/brief-feasibility/`.
  RULE: when a brief authorises an outcome that a deny rule guards, it names the exact working route and the refused ones, and a "do not retry another way" clause is scoped to the action it protects, never written as a blanket.

- **`brief-had-workers-open-every-image`**
  RULE: a long-running worker gets an IMAGE BUDGET stated in its brief — at most 4 contact sheets per run, its own captures only, each first checked by a DOM assertion and the PNG size at capture time — and reviewing a body of existing images is a separate short-lived unit whose only job is that review.

- **`acted-on-a-live-actors-working-state`**
  RULE: before committing, reaping, rebasing or otherwise acting on ANY worktree that is not mine, establish that its actor has STOPPED from the agent list, never from how finished the diff looks.
  RULE: commit with an explicit pathspec (`-- <paths>`, or `--only <paths>`) in ANY repo another actor may have touched, never a bare `commit` that sweeps the whole shared index.

- **`worker-overwrote-master-backlog`** — A delegated subagent may never write, update, or delete the project's master backlog (a `topic_key`/observation ending `-master`)
  RULE: the mandate now names its subject explicitly (the orchestrator only); a delegated agent puts its finding in its `SubagentHandback` report instead, and the orchestrator transcribes it into the backlog the same turn.

- **`isolation-guard-screens-edits-but-not-shell-writes`** — CLOSED BY MECHANISM 2026-09-30 (b100-am-ui). A rule enforced on ONE write channel and absent on the other is not a rule. **POLICY, one rule:** an isolated worker writes ONLY inside its own worktree and its private scratch; main-checkout tooling is changed by a worker that is NOT isolated and whose brief carries a `TENANCY:` line naming it.
  RULE: before a brief authorises a write by absolute path, establish whether its worker is isolated; an isolated worker is never told to write the main checkout, and a policy about writes is decided over the write TARGETS of a call, never per tool, so every channel gets the same answer.

- **`orchestrator-cwd-change-leaked-to-workers`**
  RULE: the main session runs a command in another directory with (1) absolute paths or `git -C <dir>`, (2) a `( cd <dir> && … )` subshell, or (3) `run_in_background`.

- **`delegated-role-toolset-narrower-than-its-contract`** — Before delegating to a named role, check that its declared toolset can satisfy its task: a role asked to MEASURE or VERIFY needs execution (Bash). When it cannot, fix the role definition, never work around it in the brief.

- **`brief-measured-line-carried-an-unmeasured-claim`** — A `MEASURED:` line carries only what a command in THIS turn measured.
  RULE: before a durable record's state claim (contract, memory, backlog) goes into a brief, re-measure it in the same turn and write the command beside it. Otherwise it goes under `HYPOTHESIS:` with the record and its date.
  RULE (face of 2026-10-12, b100-am-ui-f8): a claim about what a gate can SEE is measured on the build that gate actually runs (development or production) before it enters a `MEASURED:` line; a previous worker's claim relayed in the same block is re-measured too. A brief said the demo crawler fails on a missing-engine DevMode warning, but `check:demo-crawler` runs the production `build:demo` output, where DevMode guards are compiled out.

- **`contract-doc-names-a-mechanism-nobody-verifies`** — A path, script name, hook or wiring quoted from a memory or contract document is a HYPOTHESIS until the filesystem confirms it; confirm it before quoting it to a worker or to the owner, and fix the document in the same turn when it moved.
  RULE (face of 2026-10-11, b100-am-ui-f8): this covers how something is DEPLOYED or PUBLISHED too — before a question to the owner or a decision rests on it, read the pipeline or config that does it in the same turn. A licence question about a "public GitLab Pages showcase" came from a memory title; the CI file showed a downloadable artifact and no Pages.

- **`blamed-the-tool-for-a-defect-i-built-into-the-command`** — When a tool appears to misbehave, reproduce the behaviour on a MINIMAL input you fully control first; a defect you cannot reproduce minimally is a hypothesis about your own usage, and an unreproduced tool defect is never written into a brief.
