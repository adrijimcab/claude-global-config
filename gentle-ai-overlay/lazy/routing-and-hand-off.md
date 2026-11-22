#### Cost and Context Balance

- Use exploration sub-agents to compress broad repo reading into a short handoff.
- Delegate a writer only for a named reason; parallel writers follow the **Parallel writers** rule under `## Implementation Routing`.
- Let native review select its bounded checking plan; delivery remains human-owned under ordinary repository policy.
- Avoid delegation for truly local one-file fixes, quick state checks, and already-understood mechanical edits.

### Work Routing Ladder

Route ODD work through the smallest harness that is safe. "Smallest" means minimal safe coordination, not zero delegation by default. The ODD protocol and its test-first policy live under `## Implementation Routing`; this ladder only picks the harness.

#### 1. Inline Direct

Use inline execution when the task is small by the Task Size section of the routing block: read, edit (one understood change may span files), run its focused test and suite once each, or bash for state. Keep the ODD path proportionate. When a mechanism's own trigger fires, turn on only that mechanism, then re-evaluate.

Inline evidence uses one parallel batch, at most 3 calls and approximately 10k tokens. Use bounded search/line ranges rather than whole large files. These are evidence limits, not file-count routing rules; preparation for a delegated write and broad research still delegate, and an inline write reads inline.

#### 2. Simple Delegation

Delegate when a mechanism's own trigger fires, within the ODD workflow: understanding an unfamiliar module beyond the inline batch budget (explore), implementing a unit with a writer reason (writer), or checking a change that names a high-risk item (independent verifier). A writer reason is parallel units launched together in one turn (independent units of behavior, each with its code, tests, and docs and several minutes of work) or the context backstop, never size, a large task alone, file count, or a price ratio; without one, the parent writes inline, following its logbook.

Route exploration to a read-only exploration worker, each unit with a writer reason to one bounded writer, and verification of a named high-risk item to a verification worker, all through the runtime's subagent/delegation mechanism. The delegation trigger stays mandatory; a missing named worker changes the runtime used, not the requirement to delegate. If no delegation mechanism is available, follow this runtime's documented degradation path, or stop and explain the blocker instead of silently continuing inline.

Understanding that needs more evidence or more than approximately 5 sequential lookups requires one read-only explorer; with its handoff, re-evaluate task size. Return at most approximately 2k tokens with path:line evidence and one parent spot check. Do not reread the entire mapped evidence.

Keep parent bash output bounded to counts, --stat, tail, or summaries. On a large task, delegate long suites and builds; return concise observed results, including failures. The approximately 150k parent-context backstop is advisory guidance, not mechanically observed or enforced; pause and delegate the next bounded unit without claiming runtime telemetry or enforcement.

Default pattern for authorized implementation:

```text
parent clarifies and checks git → parent writes inline following the logbook → focused test and suite inline → parent reports
```

With a writer reason, one bounded worker per unit writes instead, followed by one seam check when units ran in parallel.

### Canonical Lightweight Workflows

Bugfix with unfamiliar flow:

```text
parent git/status + clarify → exploration worker maps flow/files the parent needs to decide → parent implements authorized fixes + tests inline (a writer only for a named reason) → focused verification → parent reports
```

Conflict or dependency-marker cleanup:

```text
parent reproduces/checks conflict → parent or writer resolves inside the active scope → verify markers, package/lock consistency, and repository cleanliness → parent reports
```

After tooling/worktree incident:

```text
stop writes → parent captures git status → diagnose affected repositories/worktrees with no edits → parent applies only confirmed recovery steps
```

### Allowed edit surfaces (MANDATORY)

A bounded writer refuses to write outside the exact allowed edit surfaces and stops for interaction when they are missing. The parent owns that input. A writer that needs a route beyond its surface never widens it on its own: it reports the necessary exact candidate paths with their reasons and waits for the parent-issued declaration. Every new writer launch carries the section (a continuation inherits it); after a rejected launch, repair what the rejection names once, never relaunch the same prompt unchanged. A continuation continues the same writer, and the section you pass replaces the inherited one rather than adding to it: carry every still-needed path, including the unchanged ones, and the concise reason for the addition. Dropping a needed path is the same defect as no surface, and an extension never widens to a repository-wide surface or resets a budget.

Before launching a bounded writer through the runtime's delegation mechanism, derive the allowed edit surface from the task being delegated — the files the planned change must touch, plus the directories where the task authorizes new files — and pass it in the delegated prompt under an `## Allowed edit surfaces` heading:

- exact repository-relative paths or narrow globs, one per line; never `.`, a bare repository root, or an absolute path; paths containing whitespace require whole-entry backticks;
- the section ends at the next Markdown heading; every non-empty line before it must be a valid surface entry, so put explanatory prose under a following heading;
- pre-existing untracked targets the writer may write, listed explicitly;
- the directories where new files are authorized, when the task requires new files;
- nothing beyond the delegated task — a surface wider than the task is the same defect as no surface at all.

If the surface genuinely cannot be derived, do not launch the writer, and do not ask the human to author paths. Derive a candidate set first — the exact paths this task would touch — and present that enumerated list as an approve/decline choice under the Lossless Blocking Prompts rules. Investigate a technical uncertainty about the route inside the authorized work; it is not a human question by itself.

Adjudicate a writer's edit-surface request yourself first: add a necessary path to its declaration without asking the human, when the route serves the objective already authorized in the same repository and you have checked ownership, preservation of existing work, risk, and concurrency with other writers and units. An optional or cosmetic refactor is not that necessary path, and an unresolved overlap or ownership conflict blocks the addition until it is settled. Only a real new objective or product scope, an unapproved repository, private material, a destructive or otherwise prohibited operation, missing consent, a denied action, or an exhausted limit goes to the human, under the existing protocols; for that human choice, present the writer's derived candidate paths under the Lossless Blocking Prompts rules. A surface entry never substitutes for repository or worktree authority and never authorizes an operation the rules prohibit.

### Delivery strategy

Use the ODD delivery strategy and work-unit boundaries under `## Implementation Routing`. Push, PR creation, and merge remain human decisions.

### Intent-Driven Skill Discovery

For skill-shaped requests, do not treat the injected skill list as complete. Use the skill registry and filesystem only as a discovery aid; do not let a trigger table override the user's concrete request or turn a small request into a larger workflow.

Discovery order:

1. Read `.atl/skill-registry.md` when present.
2. If the registry suggests a specific skill, load the indexed `SKILL.md` path before acting.
3. If the expected skill is absent from the registry but the request clearly names a known workflow, search common project/user skill directories such as `./skills`, `.agents/skills`, `~/.config/opencode/skills`, `~/.claude/skills`, and other configured skill roots.
4. Prefer the most specific project skill over a global skill with the same intent.
5. If no matching skill exists, continue with the smallest safe fallback and say which expected skill was unavailable.

Common intent hints, not hard routing:

| User intent                | Skill to check                         |
| -------------------------- | -------------------------------------- |
| PR review / GitHub PR URL  | project review skill, then `pr-review` |
| Post-ready review comments | `comment-writer`                       |
| Create/open/prepare PR     | `branch-pr`                            |
| Split/stack/large PR       | `chained-pr`                           |

Keep this lightweight: loading a skill should improve the immediate task, not force extra ceremony.

