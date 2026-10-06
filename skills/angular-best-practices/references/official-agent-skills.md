# Verdict: Angular's official agent skills versus this skill

Evaluated 2026-10-06 against `github.com/angular/skills` at commit `6075fa502f25a0f784b8452c33a004d8ed1ad787`
(BUILD_INFO 2026-10-06, source `angular/angular` 439d495a), installed per the docs with
`npx skills add https://github.com/angular/skills` (`A21/A22:adev/src/content/ai/agent-skills.md`; absent from
the 20 docs).

## What it is

- `angular-developer/SKILL.md` (10,735 chars) plus 40 reference files (212 KB on disk) extracted from the current
  angular.dev guides; `angular-new-app/SKILL.md` (4,343 chars) for `ng new`.
- Its first rule is "analyze the project's Angular version before providing guidance", but the references are
  the CURRENT (22) docs: only a few lines are gated (Signal Forms "v22 and newer", naming "v20+"). It has no
  per-major status table, no migration list per hop, no EOL awareness, and no guidance for 19/20 projects.
- For a new project it says "use the latest stable version" and Signal Forms: correct for a 22 project.

## Cost

- Always loaded: its two `description`s (about 660 characters) in every session where it is installed, plus a
  trigger overlap with this skill (both fire on any Angular file).
- On invocation: 10.7k characters, references read on demand.
- This skill: description about 580 characters; on invocation SKILL.md (7.5k characters) plus ONE version
  file (5.3-6.8k), about 13-14k in all, because only the project's major is read.

## Verdict

- **Not adopted globally.** In 19/20 projects (the owner's main load) its v22-shaped references would push APIs
  that are experimental or absent there; this skill's gating is the reason it exists.
- **The official rules file is adopted instead, as the single source for 21+**:
  `node_modules/@angular/core/resources/best-practices.md` ships with the exact installed version, costs
  nothing until read, and is what the `Profile:` line and Step 0 point to. Our `versions/v21.md` and `v22.md`
  carry only the delta.
- **Optional per project on 22+**: a v22 project may install `angular/skills` at project scope
  (`.claude/skills/`) if its team wants the extended guides; then disable or narrow this skill's overlap there.
  Supply-chain note: `npx skills` fetches third-party code at install time; pin the commit.
- Re-evaluate when `angular/skills` gains per-version branches or gated references.
