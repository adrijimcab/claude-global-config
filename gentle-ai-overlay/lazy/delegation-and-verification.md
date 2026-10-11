### Language Domain Contract

- The active persona controls direct user/orchestrator conversation only. Use it for direct replies, clarification prompts, and user-facing orchestration status.
- Generated technical artifacts default to English regardless of the active persona or conversation language. This includes tasks, code comments, UI copy, tests, fixtures, and delegated outputs.
- If technical artifacts are explicitly requested in another language, use a neutral/professional register unless the user explicitly requests a different tone or regional variant.
- Public/contextual comments follow the target context language by default. Explicit user language or tone overrides win; otherwise use a neutral/professional register unless the target context clearly calls for another tone or regional variant.
- When delegating, forward this contract to the executor so persona voice never becomes the artifact or public-comment default.

### Delegation Rules

These rules select execution topology, not the implementation method. Implementation runs as **direct inline** or **delegated direct** under ODD; size, file count, or risk alone never selects a different workflow.

Core principle: **does this inflate the parent context without need?** If yes, use one bounded worker. If no, do it inline.

| Action | Direct inline | Delegated direct worker |
|--------|---------------|-------------------------|
| Decide/verify within the inline evidence budget | ✅ one bounded batch | — |
| Larger evidence, sequential exploration, or long-session mapping | — | ✅ one read-only explorer |
| Read as preparation for writing | — | ✅ together with the write |
| Write one mechanical, already-understood file | ✅ | — |
| Write 2+ non-trivial files | — | ✅ one writer |
| Bash for state (`git`, `gh`) | ✅ | — |
| Tests, builds, installs, or native review actions | allowed as a bounded action | ✅ fresh per-action worker without changing route |

Use Claude Code's native Agent/Task mechanism for delegated-direct work. Summarize any needed handoff explicitly.

Keep one writer and a short synthesized handoff. Delegation is mandatory at the mapping, write, preparation, and broad-research boundaries.

#### Mandatory Delegation Triggers

These are parent-orchestrator routing boundaries. Use the smallest useful topology and keep the safety machinery behind the outcome-first interaction. Do not pass these rules to child agents as permission to orchestrate.

1. **Evidence budget rule**: decide or verify inline with one parallel batch, at most 3 calls and approximately 10k tokens. Use bounded search/line ranges, not whole large files.
2. **Mapping rule**: larger evidence, more than approximately 5 sequential lookups, or long-session mapping require one read-only explorer. Return at most approximately 2k tokens with path:line evidence and one parent spot check. Do not reread the entire mapped evidence.
   - Keep parent bash output bounded to counts, --stat, tail, or summaries. Delegate full suites and builds; return concise observed results, including failures.
   - The approximately 150k parent-context backstop is advisory guidance, not mechanically observed or enforced. Pause and delegate the next bounded unit; do not claim runtime telemetry or enforcement.
3. **Write rule**: keep one mechanical, already-understood file inline only when it needs no research or unresolved design work; delegate one writer for 2+ non-trivial files.
4. **Context rule**: delegate reading that prepares a write and broad research/context compression.
5. **Per-action rule**: tests, builds, installs, and native review actors may use fresh workers without changing the implementation route.

#### Delegated Verification Gate (MANDATORY)

Verification of a delegated writer's work is decided by two inputs the parent reads deterministically: the receipt-driven development (RDD) state for the repository (`on`, `off`, or `unknown`), and the native risk tier from `gentle-ai review assess --cwd <repo> --json` (`gentle-ai.review-assessment/v1`, `risk` one of `passive`, `medium`, `high`). A runtime that already renders an RDD status line reads it from there; otherwise read `gentle-ai review mode status` (read-only) and treat a failure as `unknown`. Any assessment failure or an unrecognized verb is treated as `high`.

The `on` branch below holds only while the native review reaches a terminal outcome for this candidate. When the human declines the consent envelope for this candidate (candidate-scoped; never the kill switch), when receipt-driven development is disabled for the clone after this status was read, or when START or STATUS refuses, the parent follows the RDD off path instead: run `gentle-ai review assess --cwd <repo> --json` over the writer's diff and apply the tier table below. An unknown outcome is treated as not closed, never as terminal.

- **RDD on**: the bounded writer runs the parent-authorized `## Verification` commands in the foreground and reports `<command>: <observed result>`; that report is the verification of record, and the native review is the independent check. A separate verifier stays on-demand only — the writer reported `partial` or `blocked`, an expensive or external check the parent wants run on a cheaper profile, or a parent spot check. A passive candidate needs only the parent's structural readback.
- **RDD off or unknown**: after the writer returns, the parent runs `gentle-ai review assess` over the writer's diff and follows the tier — passive: structural readback only; medium: writer self-verification, with a separate verifier only when the writer ran on a small-model profile (low effort or a mini model); high or unassessable: writer self-verification plus an independent verifier. `unknown` never lowers a tier, and the small-model bias raises the tier by one for verification purposes.
- The parent spot check — re-running one reported command before delivery — stays in every tier.
- The writer receives `## Verification` naming the exact commands to run, and may receive `## Known environmental failures` naming exact test names or command lines already failing on the base as evidence; any other failing required command still forces `partial`.
- Exploration stays a separate delegation only when the parent needs the map to decide or route; reading that prepares a write belongs to the writer doing that write.

#### Native Checking Contract

- Final source-mutating normalization happens before functional verification and candidate freeze.
- **Normalization ordering rule**: before review START and its identity freeze, run every source-mutating normalizer, then re-snapshot the candidate and review those exact bytes, paths, and modes. After START, only check-only formatting, typechecking, tests, and native gates may run. A mutating commit hook is allowed only when already convergent and therefore a no-op; any byte, path, or mode change invalidates the receipt and requires normalization followed by a new review, never formatter-only tolerance.
- Native RAR owns verification applicability, risk, the bounded zero/one/four-lens plan, correction impact, and terminal receipt. The orchestrator and adapters never select lenses or author PASS.
- A passive ordinary document or image needs structural readback, not an artificial semantic-verification subagent. Active, mixed, operational, executable, mode-changing, or unknown content fails closed into the applicable native plan.
- For a trivial passive documentation-only edit, structural readback is the complete proportional check; do not open a separate semantic-verification or heavy review ceremony.
- If an applicable verifier is unavailable, preserve the typed unavailable result; never invent PASS, retry indefinitely, or escalate into extra ceremony.
- An applicable quick check runs once. Long or very-long work gets one cost/side-effect forecast before launch. Unavailable, partial, declined, or exhausted proof becomes one actionable **Needs your decision** result.
- Functional proof and adversarial review both project as **Checking**. One immutable candidate permits at most one scoped correction; there is no loop-until-clean behavior.
- Commit, push, PR, direct-main, emergency, and release gates are informational and unmanaged; ordinary repository policy decides delivery and they never reopen review for unchanged content.

