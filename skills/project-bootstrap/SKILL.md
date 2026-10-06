---
name: project-bootstrap
description: >
  Sets up Claude Code in a new or not-yet-configured JS/TS repository: detects the stack with
  ~/.claude/project-profile (never by guessing), writes a short project CLAUDE.md, the agent contract and
  findings register from gates-kit, the gates and fleet-kit wiring, and the canonical project files
  (.mcp.json, .claude/settings.json, CLAUDE.local.md, rules/skills/agents) each by its documented verdict.
  Merges with files `ng new --ai-config` already wrote instead of overwriting them.
disable-model-invocation: true
argument-hint: "[project root]"
---

# Project bootstrap

Run only when the owner asks (`/project-bootstrap`). Read-only until step 3 is confirmed; every file it writes
is listed in the final report with its reason.

## 1. Measure (no parallel logic)

```sh
node ~/.claude/project-profile/profile.mjs <root> --json
```

The profile is the only source for framework, major.minor, TypeScript, runners, builder, zoneless, package
manager, `gatesStack` and `agentFiles`. A `declared` (not installed) version means: install first, or say in
the CLAUDE.md that versions are unverified. Then read the project's own `package.json` scripts (the gate
commands come from there) and `git remote -v` (GitLab or GitHub decides the review/PR commands).

## 2. Existing files win

For each name in `agentFiles` (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.mcp.json`, `.claude`), read it
fully before writing. `ng new --ai-config=claude-code` (Angular CLI 20.2+) writes a `CLAUDE.md` embedding the
official rules and a `.mcp.json` registering the Angular MCP server: keep both, add only what is missing, and
on Angular 21+ propose replacing the embedded rules block with a pointer to
`node_modules/@angular/core/resources/best-practices.md` (the embedded copy goes stale on every update; the
shipped file never does). An `AGENTS.md` with no `CLAUDE.md`: Claude Code reads `AGENTS.md` only while no
`CLAUDE.md`/`CLAUDE.local.md` exists, so creating either stops it; import it from the new `CLAUDE.md`
(`@AGENTS.md`) instead of duplicating it.

## 3. Decide with the owner (one question)

Whether this repository may carry AI configuration in git (company policy). Yes: the team-shared files below
are committed. No: they live in a git-excluded `.claude/` (`.git/info/exclude`), backed up to a private repo the
owner names, as the owner mandate on versioned agent config requires. Ask it, then STOP until answered.

## 4. Write

Per `references/structure-verdicts.md` (one verdict per canonical item, with the official doc it rests on):

1. `CLAUDE.md` at the root from `templates/CLAUDE.md.template`: at most 60 lines (`wc -l`), facts the code
   cannot tell (commands, gates, conventions, boundaries); no rule already in `~/.claude/rules/` or a skill.
2. `.claude/AGENT-CONTRACT.md` from `~/.claude/gates-kit/templates/<template>/AGENT-CONTRACT.md`:
   `angular-app` (Angular application), `angular-lib` (Angular `projectType: library`), `nest-api` (NestJS),
   `node-lib-vitest` (Node + Vitest). Replace the full-chain command with the project's own script; keep the
   G1-G6 anchors verbatim (checked by `gates-kit/templates/template-rules.mjs`). No template for the stack
   (React, Vue, Next.js): copy `angular-app`, replace its G3 gate list with the stack file's gates
   (`~/.claude/gates-kit/react.md`), and record that gap as a finding.
3. Findings register: `.claude/FINDINGS.jsonl`, the path the contract names. It is never written by hand: the
   first `node ~/.claude/gates-kit/findings-register.mjs add ...` creates it, and `validate` checks it.
4. Gates: follow `~/.claude/gates-kit/README.md` "How a project adopts this kit": Tier 1 from
   `tier1-tier3-menu.md`, the stack file, config copied into the project; a new gate lands with zero
   offenders or stays registered and disabled. The gates run on the project's toolchain; the kit's pinned
   `toolchains/<gatesStack>/` is for the kit's own executable gates.
5. fleet-kit (only when agents will work in worktrees here): `.claude/fleet-kit.json` per
   `~/.claude/fleet-kit/DESIGN.md` §3 and the hook entries of §4 in `.claude/settings.local.json`; both are
   local and git-excluded by design. A disabled section states its reason.
6. `.mcp.json` for Angular when `angular.cli` >= 20.1 (the `ng mcp` command does not exist before CLI 20.1.0):

   ```json
   { "mcpServers": { "angular-cli": { "command": "npx", "args": ["-y", "@angular/cli", "mcp", "--read-only", "--local-only"] } } }
   ```

   Least privilege: `--read-only` drops the tools that change the workspace, `--local-only` the ones that
   reach the network (documentation search). Widen only on the owner's decision, by removing a flag in that
   project's file. On 22, `--root <dir>` (repeatable) restricts the workspace roots the server may touch. The
   docs still call the server experimental: say so in the CLAUDE.md. Never for Angular 19.
7. `CLAUDE.local.md` only if the owner has personal notes for this repo; it is added to `.gitignore` in the
   same change (the harness does not ignore it for you).
8. Register the backup repository in the owner's global mandates when the `.claude/` is not in the project
   repository (owner mandate "Config de agentes versionada").

## 5. Prove

- `wc -l CLAUDE.md` <= 60.
- The contract is complete (prints `[]`):
  `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { homedir } from 'node:os'; const { inspectTemplate } = await import(homedir() + '/.claude/gates-kit/templates/template-rules.mjs'); console.log(JSON.stringify(inspectTemplate(readFileSync('.claude/AGENT-CONTRACT.md', 'utf8'))))"`.
- Start a fresh session in the root: the `Profile:` line appears, and `/memory` lists the new CLAUDE.md.
- `.mcp.json`: `claude mcp list` shows `angular-cli` after the one-time approval.
- Report every file written, every verdict applied, and every gap as a finding.
