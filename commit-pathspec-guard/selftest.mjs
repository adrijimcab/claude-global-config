#!/usr/bin/env node
/**
 * Self-test for commit-pathspec-guard (`acted-on-a-live-actors-working-state`, 2nd occurrence).
 *
 * The state space that matters is the one the decision actually ranges over: BOTH declared backup repos
 * (`config-sync-guard/repos.mjs`, never hardcoded here), BOTH shapes that reach them (a plain `git commit`
 * and the `backup-repo.mjs` wrapper), BOTH ways a commit can legitimately name its paths (`-- <paths>` and
 * `--only`), the near miss where a `--`-like SUBSTRING sits inside a quoted `-m` message rather than as a
 * real argument, and the DATA face — `echo`/heredoc mentions of the exact refused shape, which must never
 * trigger it (`guard-that-cannot-go-red`: the near miss is a state, and a false positive there is exactly
 * how a correct-looking guard gets talked around).
 *
 * PATHS COME FROM `declaredRepos()`, never typed here twice: a repo renamed or moved in `repos.mjs` must
 * not leave this selftest proving something the guard no longer decides.
 *
 * @es Auto-test. El espacio de estados: AMBOS repos declarados (nunca fijados a mano aquí), AMBAS formas
 * de alcanzarlos (`git commit` llano y el envoltorio), AMBAS formas legítimas de nombrar rutas, el CASI-
 * ACIERTO de un `--` dentro de un mensaje entre comillas (debe seguir rechazando), y la cara DATO
 * (`echo`/heredoc), que nunca debe disparar la guardia.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');

const { payloadFor } = await import(pathToFileURL(join(HERE, '..', 'hook-payloads', 'payloads.mjs')).href);
const { declaredRepos } = await import(pathToFileURL(join(HERE, '..', 'config-sync-guard', 'repos.mjs')).href);
const { dialectOfTool } = await import(pathToFileURL(join(HERE, '..', 'shell-command', 'shell-command.mjs')).href);

let failures = 0;
let total = 0;

/** Records one outcome and prints it. @es Registra un resultado y lo imprime. */
function report(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const repos = declaredRepos();
const claudeRepo = repos.find((repo) => repo.name === '~/.claude');
const b100Repo = repos.find((repo) => repo.name === 'b100-am-ui/.claude');

if (claudeRepo === undefined || b100Repo === undefined) {
  report(false, `declaredRepos() no trae los dos repos esperados: ${repos.map((repo) => repo.name).join(', ')}`);
  console.log(`\n${total - failures}/${total} passed`);
  process.exit(1);
}

// `b100-am-ui`, the PROJECT ROOT — one level above its `.claude` backup — is NOT a declared repo itself,
// which is exactly what proves "a commit in b100-am-ui itself" stays allowed.
// @es La raíz del proyecto b100-am-ui NO es un repo declarado: por eso un commit ahí queda permitido.
const b100ProjectRoot = dirname(b100Repo.worktree);
const wrapperPath = join(b100Repo.worktree, 'backup-repo.mjs');
const forwardSlashClaudePath = claudeRepo.worktree.split('\\').join('/');

/** A payload for `tool`, with `command` and `cwd` — the two fields this decision reads. @es Payload con `command` y `cwd`. */
function payloadAt(tool, cwd, command) {
  return JSON.stringify({ ...payloadFor(tool, command, { sessionId: 'selftest' }), cwd });
}

const bashAt = (cwd, command) => payloadAt('Bash', cwd, command);
const powershellAt = (cwd, command) => payloadAt('PowerShell', cwd, command);

const cases = [
  // --- REAL CASE, 2026-09-30: the wrapper commit that produced 89b9dad with 63 unintended deletions.
  ['deny', bashAt(b100Repo.worktree, `node "${wrapperPath}" commit -m "feat(x): add rule"`), 'REAL CASE: backup-repo.mjs wrapper commit, no pathspec', 'COMMIT-PATHSPEC GUARD REFUSED'],
  ['allow', bashAt(b100Repo.worktree, `node "${wrapperPath}" commit -m "feat(x): add rule" -- AGENT-LEDGER.md`), 'THE REMEDY — wrapper commit WITH an explicit `-- <paths>`'],
  ['allow', bashAt(b100Repo.worktree, `node "${wrapperPath}" commit --only -m "feat(x): add rule" AGENT-LEDGER.md`), '`--only` on the wrapper is accepted too'],
  ['deny', bashAt(b100ProjectRoot, `node "${wrapperPath}" commit -m "x"`), 'the wrapper is identified by ITS OWN script directory, not by the caller\'s cwd'],
  ['allow', bashAt(b100Repo.worktree, `node "${wrapperPath}" push origin master`), "NEAR MISS: the wrapper's first argument is NOT `commit` — none of this guard's business"],
  ['allow', bashAt(b100Repo.worktree, `node "${join(b100Repo.worktree, 'other-script.mjs')}" commit -m "x"`), 'NEAR MISS: a script NOT named backup-repo.mjs, sitting in the same declared repo, is not the wrapper'],
  ['allow', bashAt(b100Repo.worktree, `less "${wrapperPath}" commit -m "x"`), 'NEAR MISS: the executable is NOT `node`, so a path merely naming backup-repo.mjs is not the wrapper'],

  // --- plain `git commit`, cwd resolves inside the repo (no `-C` at all).
  ['deny', bashAt(claudeRepo.worktree, 'git commit -m "chore(rules): tweak"'), 'plain commit, cwd IS the ~/.claude backup repo'],
  ['allow', bashAt(claudeRepo.worktree, 'git commit -m "chore(rules): tweak" -- rules/promoted-rules.md'), 'THE REMEDY — plain commit WITH an explicit `-- <paths>`'],
  ['allow', bashAt(claudeRepo.worktree, 'git commit --only -m "chore(rules): tweak" rules/promoted-rules.md'), '`--only` on the plain form is accepted too'],

  // --- `git -C <path> commit`, cwd deliberately UNRELATED — proves `-C` decides, not cwd.
  ['deny', bashAt(b100ProjectRoot, `git -C "${forwardSlashClaudePath}" commit -m "x"`), 'FORWARD-SLASH `-C` path, cwd elsewhere'],
  ['deny', bashAt(b100ProjectRoot, `git -C "${claudeRepo.worktree}" commit -m "x"`), 'WINDOWS (backslash) `-C` path, cwd elsewhere'],
  ['deny', bashAt(b100ProjectRoot, `git -C="${claudeRepo.worktree}" commit -m "x"`), 'the FUSED `-C=value` spelling is honoured too'],
  ['deny', bashAt(claudeRepo.worktree, `git -C "${b100Repo.worktree}" commit -m "x"`), 'a PLAIN git commit reaching the OTHER declared repo through `-C`, bypassing the wrapper entirely'],
  ['allow', bashAt(b100ProjectRoot, `git -C "${claudeRepo.worktree}" commit -m "x" -- foo.txt`), '`-C` plus an explicit pathspec'],
  ['deny', bashAt(claudeRepo.worktree, 'git commit -m "x" --'), 'NEAR MISS: a bare trailing `--` names NO path at all — still refuse'],

  // --- THE STAGED-CONTENT TOOL: it runs its own git commit after checking the index, so the guard has nothing to refuse in the command itself.
  ['allow', bashAt(claudeRepo.worktree, 'node ~/.claude/commit-pathspec-guard/commit-staged.mjs --repo "~/.claude" --expect rules/promoted-rules.md -- -m "chore(rules): tweak"'), 'the staged-content tool is not a commit for the guard to refuse: it verifies the index itself'],

  // --- a commit that lands OUTSIDE any declared repo: the project itself, not its `.claude` backup.
  ['allow', bashAt(b100ProjectRoot, 'git commit -m "feat(x): add rule"'), 'a commit in b100-am-ui ITSELF (its project root, not the declared `.claude` backup) is none of this guard\'s business'],

  // --- every non-commit git command is none of this guard's business either.
  ['allow', bashAt(claudeRepo.worktree, 'git status --porcelain'), 'a non-commit git command inside a declared repo'],
  ['allow', bashAt(claudeRepo.worktree, `git -C "${claudeRepo.worktree}" add -A`), '`git add` alone stages; it does not commit, so it is out of scope'],

  // --- THE NEAR MISS: a `--`-shaped SUBSTRING sitting inside a quoted `-m` message is not a real pathspec.
  ['deny', bashAt(claudeRepo.worktree, 'git commit -m "commit -- rewrite messaging"'), 'NEAR MISS: the message CONTAINS " -- " and the word "commit", but names no real pathspec — must still refuse'],
  ['deny', bashAt(b100Repo.worktree, `node "${wrapperPath}" commit -m "note: -- add paths later"`), 'NEAR MISS on the wrapper: same substring trap inside the message'],

  // --- DATA, NOT COMMAND: a mention inside `echo` or a heredoc body is never a command.
  ['allow', bashAt(claudeRepo.worktree, 'echo "git -C ~/.claude commit -m x"'), 'DATA: the exact refused shape, but only ECHOED'],
  ['allow', bashAt(claudeRepo.worktree, "cat <<'EOF' >> note.txt\ngit -C ~/.claude commit -m \"x\"\nEOF"), 'DATA: the exact refused shape, inside a heredoc BODY'],

  // --- PowerShell syntax: the same decisions, the other shell.
  ['deny', powershellAt(claudeRepo.worktree, 'git commit -m "x"'), 'PowerShell: plain commit, no pathspec'],
  ['allow', powershellAt(claudeRepo.worktree, 'git commit -m "x" -- foo.txt'), 'PowerShell: plain commit WITH an explicit pathspec'],
  ['deny', powershellAt(b100ProjectRoot, `git -C "${forwardSlashClaudePath}" commit -m "x"`), 'PowerShell: forward-slash `-C` path, cwd elsewhere'],
  ['deny', powershellAt(b100Repo.worktree, `node "${wrapperPath}" commit -m "x"`), 'PowerShell running the wrapper'],

  // --- NOT A SHELL COMMAND, and NO COMMAND AT ALL: outside the decision.
  ['allow', JSON.stringify(payloadFor('SendMessage', 'run git commit into the backup repo', { sessionId: 'selftest' })), 'a message MENTIONING the shape is not running it'],
  ['allow', JSON.stringify({ ...payloadFor('Bash', '', { sessionId: 'selftest' }), tool_input: {} }), 'no command at all'],
  ['allow', JSON.stringify({ tool_name: 'NotAShellTool', session_id: 'selftest', tool_input: { command: 'git commit -m "x"' }, cwd: claudeRepo.worktree }), 'a tool with NO known shell dialect, even carrying a real commit-shaped `command` field, is still none of this guard\'s business'],

  // --- FAIL-OPEN.
  ['allow', 'NOT JSON AT ALL', 'garbage payload'],
  ['allow', '', 'empty payload'],
  ['allow', '\uFEFFNOT JSON', 'BOM + garbage']
];

for (const [expected, input, label, expectedText] of cases) {
  let output = '';
  let code = 0;

  try {
    output = execFileSync('node', [GUARD], { input, encoding: 'utf8' });
  } catch (error) {
    code = error.status;
    output = error.stdout ?? '';
  }

  const actual = output.includes('"deny"') ? 'deny' : 'allow';
  const textOk = expectedText === undefined || output.includes(expectedText);

  report(actual === expected && code === 0 && textOk, `expected=${expected} actual=${actual} exit=${code}  ${label}${textOk ? '' : `  [the refusal never named: ${expectedText}]`}`);
}

// Every refusal must carry BOTH languages, per the owner's runtime-bilingual mandate — checked
// distinctly per language, so removing ONE half cannot hide behind the other still being present.
// @es Toda negativa debe llevar ambos idiomas, comprobado por separado en cada uno.
{
  const denied = execFileSync('node', [GUARD], { input: bashAt(claudeRepo.worktree, 'git commit -m "x"'), encoding: 'utf8' });
  const occurrencesOf = (haystack, needle) => haystack.split(needle).length - 1;

  report(denied.includes('COMMIT-PATHSPEC GUARD REFUSED'), 'the refusal carries the English headline');
  report(denied.includes('@es COMMIT-PATHSPEC GUARD RECHAZÓ'), 'the refusal carries its Spanish mirror, marked `@es`');
  report(denied.includes('compare the staged set with what you actually intended'), 'the ENGLISH block names the staged-set comparison');
  report(denied.includes('comparar lo que está en stage con lo que realmente se pretendía'), 'the SPANISH block names the staged-set comparison');
  report(occurrencesOf(denied, 'git diff --cached --name-only') === 2, 'the comparison command appears once per language, not merged or dropped');
  report(occurrencesOf(denied, 'commit-staged.mjs') === 2, 'the refusal names the staged-content tool once per language');
  report(denied.includes('--expect <path>') && denied.includes('--expect <ruta>'), 'each language shows the declaration flag with its own placeholder');
  report(denied.includes('WORKTREE content') && denied.includes('ÁRBOL DE TRABAJO'), 'each language says WHY `-- <paths>` is not the staged-content form');
}

// --- THE WIRING: the tools the declaration registers are exactly the ones the decision knows a dialect for.
try {
  const declaration = JSON.parse(readFileSync(join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const declared = new Set(String(declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher ?? '').split('|'));

  for (const tool of declared) report(dialectOfTool(tool) !== undefined, `the declaration registers ${tool}, which the decision knows a dialect for`);

  report(dialectOfTool('SendMessage') === undefined, 'a tool the declaration does NOT register (SendMessage) has no dialect either — the decision cannot silently cover more than it is wired for');
} catch (error) {
  report(false, `the registration declaration is unreadable: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
