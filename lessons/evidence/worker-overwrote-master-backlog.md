# worker-overwrote-master-backlog — full incident evidence

## The incident (measured 2026-09-30)

Session `c45d798b-d78f-4f60-9a32-1f722bbe86e5`, project `b100-am-ui`. Subagent `a7a6a1fc42286edd6`
(a `harness-audit-2` worker, resumed from predecessor `6620e3e8`) called:

```
mem_save({
  title: "BACKLOG MAESTRO 1.0.0 — revisión 50 (2026-09-30)",
  type: "decision",
  topic_key: "backlog/1.0.0-master",
  capture_prompt: false,
  content: "...BACKLOG MAESTRO — revisión 50..."
})
```

This overwrote the project's single master backlog record (engram observation #972) — an upsert
(engram's own `mem_save` semantics: a `topic_key` argument "reuses and updates the latest observation in
same project+scope"), landing as revision 50.

The saved content's own text (read from the subagent's transcript,
`.../subagents/agent-a7a6a1fc42286edd6.jsonl`, line 581) opened with:

> **## Reglas vigentes**
>
> **Del dueño** (fuente: `~/.claude/rules/00-owner-mandates.md`):
> - El backlog se actualiza en el mismo turno.

— i.e. the subagent cited the owner-mandate rules file as ITS OWN authority to perform the write.

## Root cause

`~/.claude/rules/00-owner-mandates.md`'s "Backlog maestro — todo hallazgo entra en el momento" section,
as it read before this incident's fix, stated the obligation ("todo hallazgo ... se escribe en ese
backlog EN EL MISMO TURNO") without naming WHO performs the write. The owner's intent, from the
directive's own verbatim quote ("apuntar esto ... y que esto se haga siempre, dejarlo como regla
implementada"), was for the ORCHESTRATOR to keep the backlog current. But `~/.claude/rules/*.md` files
load into every Claude Code session AND every subagent it spawns — there is no scoping mechanism that
keeps a rule written for the orchestrator from reaching a worker. The subagent read the section, saw an
unconditional obligation, and discharged it directly rather than reporting the finding upward.

## Why this matters more than an ordinary rule violation

The backlog is a single upsert record (`topic_key`-keyed), so a write from a subagent that does not
carry the CURRENT full text — a worker that read the backlog once at the start of a long-running task,
or that never read it at all and only synthesized a summary from its own turn's findings — silently
LOSES whatever the orchestrator or other workers added to the backlog in the meantime. In this incident
nothing was actually lost (the subagent's content correctly carried forward the prior text), but the
failure mode is a race with no lock and no diff — the next write simply replaces revision N with a
content string that may or may not be a superset of it.

## The fix

Two layers, both required (mechanism-over-memory, this project's standing operating principle):

1. **Rule layer.** `~/.claude/rules/00-owner-mandates.md`'s "Backlog maestro" section now explicitly
   names the orchestrator as the sole writer, states the incident and its root cause in one sentence,
   and tells a delegated agent to put findings in its `SubagentHandback` report instead. The same
   binding rule was added to both b100-am-ui worker contracts (`.claude/AGENT-LEDGER.md` section 9,
   `.agents/AGENTS.md` section 24), anchored in `.claude/agent-contract/parity.mjs` under
   `worker-never-writes-the-master-backlog` (parity verified: 46/46 anchors present in both files).

2. **Mechanism layer.** `~/.claude/backlog-owner-guard/` — a global `PreToolUse` guard, registered in
   `~/.claude/hook-dispatch/manifests/pretooluse-delegation.json` and reachable via the
   `settings.json` matcher covering `mem_save`/`mem_update`/`mem_delete` on both engram mount points.
   Denies any of those calls, from a subagent caller, that targets a master-backlog `topic_key` (a save,
   or an update retargeting a row onto one) or an observation id that currently resolves to one. Caller
   identity (`identify-caller.mjs`) is measured against 3,040 real `PreToolUse` payloads captured this
   session: a subagent payload always carries `agent_id` and a `transcript_path` under `subagents/`; a
   main-session payload has neither. Topic-key resolution (`resolve-topic-key.mjs`) reads engram's own
   sqlite store directly (`~/.engram/engram.db`, or `ENGRAM_DATA_DIR` when set) — the same store engram
   itself writes to, with no MCP round-trip or daemon dependency. This is the one guard in the fleet
   that fails CLOSED rather than open: an id it cannot resolve (missing store, query error, not found) is
   treated as unsafe for a subagent and refused, because what it protects — an overwritten backlog
   revision — is unrecoverable, unlike every other guard's own malfunction.

   Proof: `selftest.mjs` (51/51 assertions, exercising both caller-identity signals independently and
   together, every id-resolution outcome against a real disposable sqlite database, the near-miss of a
   topic_key containing "master" without the suffix, and the shim end to end including a literal replay
   of the real captured payload shape). `mutants.mjs` (19/19 mutants killed over the green baseline,
   using the project's vendored `mutation-proof/run-mutants.mjs`).

## Why `mem_delete` is covered defensively rather than because it is reachable today

`ToolSearch` for `mcp__engram__mem_delete` / `mcp__plugin_engram_engram__mem_delete` returned no match
in this session; `engram mcp --help` documents delete as belonging to the 4-tool "admin" MCP profile,
not the 18-tool "agent" profile subagents run under. The guard still matches it (defence in depth,
costs nothing) in case a differently-configured profile ever exposes it.

## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-30 — worker-overwrote-master-backlog: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/backlog-owner-guard/guard.mjs (selftest run, exit 0); full incident history in ~/.claude/failure-capture/state/incidents.jsonl <!--fc:worker-overwrote-master-backlog#1-->
