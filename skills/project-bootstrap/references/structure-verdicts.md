# Canonical Claude Code project structure — verdict per item

Re-judged 2026-10-06 against the official docs: `code.claude.com/docs/en/memory` (M), `/settings` (S), `/mcp`
(P), `/skills` (K), `/sub-agents` (A), `/hooks` (H). Each verdict says what the bootstrap does and why.

| Item | What the docs say | Verdict for a new project |
|---|---|---|
| `CLAUDE.md` (root) or `.claude/CLAUDE.md` | Project instructions, "team-shared via source control"; target under 200 lines; loaded at launch from the working directory and every directory above it (M) | **Write one, at the root, at most 60 lines.** 60 not 200 because the user-level rules already carry the standards: the project file holds only what the code and the global rules cannot tell. Root, not `.claude/`, so it is versioned with the code when `.claude/` is not |
| `CLAUDE.local.md` | "Personal project-specific preferences; add to `.gitignore`"; loads after `CLAUDE.md` at the same level; a gitignored one exists only in the worktree that created it (M) | **Only on request, and gitignored in the same change.** Independent of whether `.claude/` is versioned: it lives at the root, so excluding `.claude/` does not cover it. For notes shared across worktrees, import a home file (`@~/...`) instead (M) |
| `AGENTS.md` | Read only when no `CLAUDE.md`/`CLAUDE.local.md` is found on the path, unless "Project instructions" is `claude-md-and-agents-md` (M) | **Keep it; import it from `CLAUDE.md` with `@AGENTS.md`** so both agents read one source |
| `.mcp.json` (root) | Project scope: "stored in a `.mcp.json` file at your project's root", "check `.mcp.json` into version control"; `${VAR}` / `${VAR:-default}` expansion; one-time approval prompt in interactive sessions, none in `-p`/SDK/cloud (P) | **Write it for Angular CLI >= 20.1 only** (`ng mcp` does not exist in 19: npm pack of `@angular/cli@19.2.27`), with `--read-only --local-only`. It is the right home for a project-shared server; personal servers stay in `~/.claude.json` (local/user scope) |
| `.claude/settings.json` | Shared project settings, committed so everyone gets the same permissions, hooks and plugins (S) | **Write only what the project needs shared**: permissions for its own scripts (`Bash(npm run lint:*)`), hooks that must run for everyone. No personal model or UI options |
| `.claude/settings.local.json` | Personal, applied over `settings.json`; Claude Code adds it to the global git excludes when IT creates the file; a hand-made one must be ignored by hand (S) | **fleet-kit hook entries go here** (local by design, `fleet-kit/DESIGN.md` §4); if the bootstrap creates it, it also adds it to `.git/info/exclude` |
| `.claude/rules/*.md` | Modular rules; `paths:` frontmatter (YAML list or comma string) loads a rule only when a matching file is read; no `paths` = loaded at launch (M) | **Only project-specific rules, always path-scoped.** The frontend standards are already user-level (`~/.claude/rules/fe-*.md`); a project rule restates nothing from them (user and project rules both load; a conflict makes Claude follow either, M) |
| `.claude/skills/<name>/SKILL.md` | Project skills, "commit it so your team gets it too"; under 500 lines; `disable-model-invocation: true` removes the description from context (K) | **Only for project workflows** (release, a domain generator). On Angular 22 the official `angular/skills` may be added here per `angular-best-practices/references/official-agent-skills.md` |
| `.claude/commands/` | "Custom commands have been merged into skills"; old files keep working; "prefer a skill for new work" (K) | **Never created.** Existing command files are migrated to skills when touched |
| `.claude/agents/*.md` | Project subagents "should be checked into version control"; closer definitions win (A) | **None by default.** The user-level `~/.claude/agents/` already holds the review and SDD roles; a project agent only for a project-specific role |
| `.claude/hooks/` | Hooks are configured in settings files; scripts conventionally live in `.claude/hooks/`, referenced with `${CLAUDE_PROJECT_DIR}` (H) | **A folder only when the project has its own hook script**; the global hooks (profile line, dispatcher guards) already run in every project from `~/.claude/settings.json` |
| `.claude/AGENT-CONTRACT.md` | Not a Claude Code file: this repository's convention (`gates-kit/templates/`) | **Write it** from the stack's template; G1-G6 anchors verbatim |
| `.claude/FINDINGS.jsonl` | Convention (`gates-kit/findings-register.mjs`) | **Created by the first `add`**, never by hand |
| `.claude/fleet-kit.json` | Convention (`fleet-kit/DESIGN.md` §3) | **Only when agents work in worktrees here**; local and git-excluded |
| Versioning `.claude/` itself | Shared settings, skills, agents are meant to be committed (S, K, A) | **Committed when the repository allows AI config** (the one question the bootstrap asks); otherwise git-excluded and backed up to the private repo the owner declares |

## Angular CLI-generated files

`ng new --ai-config=claude-code` (CLI 20.2.0+, `C22:packages/schematics/angular/ai-config/index.ts:21-32`)
writes `CLAUDE.md` with the embedded official rules and `.mcp.json` with the `angular-cli` server
(`npx -y @angular/cli mcp`, no flags). Verdict: keep both files and merge: add the read-only/local-only flags
to its server entry (least privilege; widening is the owner's choice) and, on 21+, replace the embedded rules
with a pointer to `node_modules/@angular/core/resources/best-practices.md` so they never go stale.
`npx -y @angular/cli` resolves the project's installed CLI when it is a dependency, so the server matches the
project's version.

## UNVERIFIED

- Whether `--root .` in `.mcp.json` resolves against the server's working directory on Angular 22 (the flag
  exists, `C22:packages/angular/cli/src/commands/mcp/cli.ts:42-65`; its relative-path behaviour was not run).
- That `npx -y @angular/cli` prefers the local install in every package manager (true for npm's `npm exec`
  resolution of a locally installed package; not measured for pnpm/yarn).
