## Model Assignments

Read this table at session start (or before the first Claude Agent delegation), cache it for the session, and use the mapped alias for every Claude Agent call. Named SDD/Judgment-Day roles use their named row; organic explorer/mapper/writer/verifier and other generic delegations use the `default` assignment. If a named SDD/Judgment-Day role is missing, use the `default` row. If you do not have access to the assigned model (for example, no Opus access), substitute `sonnet` and continue.

The Claude Code session model is controlled by Claude Code itself; Gentle AI does not configure the main orchestrator model.

**Mandatory model gate:** Every Claude Agent tool call MUST include `model`. Before each Claude Agent call, resolve named SDD/Judgment-Day roles from this table; for organic explorer/mapper/writer/verifier and other generic delegations, use the `default` assignment.

| Phase | Default Model | Effort | Reason |
|-------|---------------|--------|--------|
| sdd-explore | sonnet | default | Reads code, structural - not architectural |
| sdd-research | sonnet | default | Collects source-backed evidence |
| sdd-propose | opus | default | Architectural decisions |
| sdd-spec | sonnet | default | Structured writing |
| sdd-design | opus | default | Architecture decisions |
| sdd-tasks | sonnet | default | Mechanical breakdown |
| sdd-apply | sonnet | default | Implementation |
| sdd-verify | opus | default | Validation against spec |
| sdd-archive | haiku | default | Copy and close |
| sdd-onboard | haiku | default | Guided walkthrough, pedagogical |
| jd-judge-a | opus | default | Adversarial review — blind judge A |
| jd-judge-b | opus | default | Adversarial review — blind judge B |
| jd-fix-agent | opus | default | Surgical fixes from confirmed issues |
| default | sonnet | default | Generic and SDD/JD delegation fallback |

