#!/usr/bin/env node
/**
 * Self-test for company-commit-guard, on constructed repositories: a company one (its `origin` is on a
 * simulated company host) and a personal one. The state space the decision ranges over: where the tool name
 * sits (message in each spelling, staged path, staged added line, unstaged content under `-a` or a
 * pathspec), which repository (company, personal, no repository), the near miss, a clean commit, the
 * deletion of a tainted path, a missing configuration (fail closed), the DATA face (a commit mentioned
 * inside `echo`, a heredoc or another commit's message), both shells, a subagent caller, fail-open input,
 * and the same decisions through `hook-dispatch/dispatch.mjs` with a real-shaped payload.
 *
 * @es Auto-test sobre repositorios construidos: uno de empresa (su `origin` está en un host simulado) y uno
 * personal. Cubre dónde está el nombre (mensaje en cada grafía, ruta en stage, línea añadida, contenido sin
 * stage con `-a` o pathspec), qué repo, el casi-acierto, un commit limpio, el borrado de una ruta marcada,
 * configuración ausente (falla cerrado), la cara DATO, ambos shells, un subagente, entrada basura y las
 * mismas decisiones por `hook-dispatch/dispatch.mjs` con un payload real.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseCommitArguments } from './commit-arguments.mjs';
import { PERSONAL_URL, createCompanyWorld } from '../selftest-fixtures/company-world.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// The dispatcher writes hook state; this proof writes it to a private temporary root, never the real one.
// @es El dispatcher escribe estado de hooks; esta prueba lo escribe en una raíz temporal propia, nunca en la real.
isolateState('company-commit-guard');

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const MANIFEST = join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-shell.json');

const { payloadFor } = await import(pathToFileURL(join(HERE, '..', 'hook-payloads', 'payloads.mjs')).href);
const { dispatch } = await import(pathToFileURL(join(HERE, '..', 'hook-dispatch', 'dispatch.mjs')).href);
const { dialectOfTool } = await import(pathToFileURL(join(HERE, '..', 'shell-command', 'shell-command.mjs')).href);

let failures = 0;
let total = 0;

function report(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

/** A payload for `tool`, with `command` and `cwd`. @es Un payload con `command` y `cwd`. */
const payloadAt = (tool, cwd, command, extra = {}) => JSON.stringify({ ...payloadFor(tool, command, { sessionId: 'selftest' }), cwd, ...extra });

/** Runs the guard as a process and classifies its verdict. @es Corre la guardia como proceso y clasifica su veredicto. */
function verdictOf(input) {
  try {
    const output = execFileSync('node', [GUARD], { input, encoding: 'utf8' });

    return { verdict: output.includes('"deny"') ? 'deny' : 'allow', output, code: 0 };
  } catch (error) {
    return { verdict: 'allow', output: error.stdout ?? '', code: error.status };
  }
}

const company = createCompanyWorld();
const companyConfigFile = process.env.CLAUDE_COMPANY_CONFIG;
const personal = createCompanyWorld({ url: PERSONAL_URL });

process.env.CLAUDE_COMPANY_CONFIG = companyConfigFile; // `personal` re-pointed it at its own copy of the same list

/** The commit each world starts from. @es El commit del que parte cada mundo. */
const BASE = new Map([company, personal].map((world) => [world, world.git('rev-parse', 'HEAD').stdout.trim()]));

/** Back to the pushed state, so each case starts clean. @es Vuelve al estado subido. */
function reset(world) {
  world.git('reset', '-q', '--hard', BASE.get(world));
  world.git('clean', '-fdq');
}

/**
 * One case: `setup(world)` shapes the repository, the command runs with `cwd`, and the verdict must match.
 * @es Un caso: `setup(world)` prepara el repo, se corre el comando y el veredicto debe coincidir.
 */
function scenario({ world = company, setup = () => {}, command, expected, label, tool = 'Bash', cwd = world.repo, mention, extra }) {
  setup(world);

  const result = verdictOf(payloadAt(tool, cwd, command, extra));
  const mentionOk = mention === undefined || result.output.includes(mention);

  reset(world);
  report(result.verdict === expected && result.code === 0 && mentionOk, `expected=${expected} actual=${result.verdict} exit=${result.code}  ${label}${mentionOk ? '' : `  [the refusal never named: ${mention}]`}`);
}

const stage = (path, text) => (world) => {
  world.write(path, text);
  world.git('add', '-A');
};

// --- the tool name in a MESSAGE, in every spelling.
scenario({ command: 'git commit -m "feat: add parser, written with Claude"', expected: 'deny', label: 'company: name in the -m message', mention: 'commit message' });
scenario({ command: 'git commit -m "feat: ok" -m "Co-Authored-By: Claude <noreply@anthropic.com>"', expected: 'deny', label: 'company: name in the SECOND -m (a trailer paragraph)' });
scenario({ command: 'git commit --message="fix: gentle-ai sync"', expected: 'deny', label: 'company: --message=value spelling' });
scenario({ command: 'git commit -mclaude', expected: 'deny', label: 'company: attached -mvalue spelling' });
scenario({ setup: stage('src/a.ts', 'export const a = 1;\n'), command: 'git commit -am "ask OpenAI"', expected: 'deny', label: 'company: -am cluster, the message follows' });
scenario({ command: 'git commit -m "feat: ok" --author="Claude <c@x.test>"', expected: 'deny', label: 'company: name in --author', mention: 'commit author' });
scenario({ command: 'git commit -m "feat: ok" --trailer "Co-authored-by: Copilot"', expected: 'deny', label: 'company: name in --trailer' });
scenario({ setup: (world) => world.write('msg.txt', 'feat: x\n\nvia Anthropic\n'), command: 'git commit -F msg.txt', expected: 'deny', label: 'company: name in a -F message file', mention: 'msg.txt' });
scenario({ command: "git commit -F - <<'EOF'\nfeat: x\n\nvia ChatGPT\nEOF", expected: 'deny', label: 'company: name in a -F - heredoc body', mention: 'stdin' });
scenario({ command: 'git commit -m "$(cat <<\'EOF\'\nfeat: x\n\nvia engram\nEOF\n)"', expected: 'deny', label: 'company: name inside a $(cat <<EOF) message' });
scenario({ command: 'git add -A && git commit -m "claude was here"', expected: 'deny', label: 'company: inside a chain' });
scenario({ command: 'git commit --allow-empty -C HEAD', expected: 'allow', label: 'company: -C HEAD reusing a clean message' });
scenario({ setup: (world) => { world.write('src/b.ts', 'b\n'); world.commit('feat: by Claude'); }, command: 'git commit --allow-empty -C HEAD', expected: 'deny', label: 'company: -C HEAD reusing a message that names a tool', mention: 'reused message' });

// --- the tool name in the STAGED content.
scenario({ setup: stage('.claude/settings.json', '{}\n'), command: 'git commit -m "chore: config"', expected: 'deny', label: 'company: staged PATH names a tool', mention: '.claude/settings.json' });
scenario({ setup: stage('src/a.ts', 'ok\n// generated by Claude\n'), command: 'git commit -m "feat: a"', expected: 'deny', label: 'company: staged added LINE names a tool', mention: 'src/a.ts:2' });
scenario({ setup: stage('docs/openspec/design.md', 'x\n'), command: 'git commit -m "docs: design"', expected: 'deny', label: 'company: staged directory name openspec' });
scenario({ setup: (world) => world.write('README.md', 'hello\nthanks Claude\n'), command: 'git commit -a -m "docs: thanks"', expected: 'deny', label: 'company: -a commits UNSTAGED tracked content, which names a tool', mention: 'README.md:2' });
scenario({ setup: (world) => world.write('README.md', 'hello\nthanks Claude\n'), command: 'git commit -m "docs: thanks" -- README.md', expected: 'deny', label: 'company: an explicit pathspec commits the worktree content of that path' });
scenario({ setup: (world) => world.write('README.md', 'hello\nthanks Claude\n'), command: 'git commit -m "docs: nothing staged"', expected: 'allow', label: 'company: the tainted line is UNSTAGED and not committed, so the commit is clean' });

// --- clean commits, near misses, deletions.
scenario({ setup: stage('src/a.ts', 'export const a = 1;\n'), command: 'git commit -m "feat(a): add the constant"', expected: 'allow', label: 'company: clean commit is allowed' });
scenario({ setup: stage('src/claudette.ts', 'const claudette = "copilots";\n'), command: 'git commit -m "feat: claudette"', expected: 'allow', label: 'company: NEAR MISS claudette / copilots in message, path and line' });
scenario({ setup: (world) => { world.write('.claude/old.md', 'x\n'); world.commit('chore: seed'); world.git('rm', '-q', '.claude/old.md'); }, command: 'git commit -m "chore: remove the leftover"', expected: 'allow', label: 'company: DELETING a tainted path is allowed (cleaning up)' });

// --- AI tool PATHS by segment, and attribution in the MESSAGE (company-scan/tool-paths.mjs, attribution.mjs).
for (const [path, label] of [
  ['.cursor/rules/a.mdc', '.cursor/'], ['.gemini/settings.json', '.gemini/'], ['.codex/config.toml', '.codex/'], ['.opencode/x.json', '.opencode/'],
  ['.kimi/x.json', '.kimi/'], ['.windsurf/rules.md', '.windsurf/'], ['.aider.conf.yml', '.aider*'], ['.atl/skill-registry.md', '.atl/'],
  ['.mimocode/x.json', '.mimocode/'], ['.playwright-mcp/page.yml', '.playwright-mcp/'], ['.agents/x.md', '.agents/'], ['AGENTS.md', 'AGENTS.md'],
  ['docs/GEMINI.md', 'GEMINI.md at depth'], ['AGENT-LEDGER.md', 'AGENT-LEDGER*'], ['scripts/agent-worktree-lifecycle/a.ts', '*agent-worktree*'],
  ['src/subagent-runner.ts', '*subagent*'], ['docs/agent-contract.md', '*agent-contract*'], ['rules.cursorrules', '*.cursorrules']
]) {
  scenario({ setup: stage(path, 'x\n'), command: 'git commit -m "chore: add a file"', expected: 'deny', label: `company: staged tool PATH ${label}`, mention: path });
}
scenario({ setup: stage('src/cursor-styles.css', '.a { cursor: pointer; }\n'), command: 'git commit -m "style: pointer on the card"', expected: 'allow', label: 'NEAR MISS: "cursor:" in CSS, in an added line and in a file name, is no tool path' });
scenario({ setup: stage('src/agents/list.ts', 'export const agents = [];\n'), command: 'git commit -m "feat: list the sales agents"', expected: 'allow', label: 'NEAR MISS: an "agents" folder and the word "agents" are no tool path' });
scenario({ setup: stage('docs/aiderman.md', 'x\n'), command: 'git commit -m "docs: a"', expected: 'allow', label: 'NEAR MISS: "aiderman.md" does not begin with the ".aider" segment prefix' });
scenario({ setup: stage('docs/my.cursor.notes.md', 'x\n'), command: 'git commit -m "docs: a"', expected: 'allow', label: 'NEAR MISS: ".cursor" inside a file name, not as a directory segment' });
scenario({ setup: stage('.cursor/old.mdc', 'x\n'), command: 'git commit -m "docs: a" -- README.md', expected: 'allow', label: 'a tool path OUTSIDE the explicit pathspec is not part of this commit' });
scenario({ command: 'git commit -m "feat: x" -m "Co-Authored-By: Someone <s@x.test>"', expected: 'deny', label: 'company: attribution trailer in the message', mention: 'co authored by' });
scenario({ command: 'git commit -m "feat: x" --trailer "Co-authored-by: Someone"', expected: 'deny', label: 'company: attribution --trailer' });
scenario({ command: 'git commit -m "feat: x" -m "Generated with a tool"', expected: 'deny', label: 'company: "Generated with" line' });
scenario({ command: 'git commit -m "fix: x" -m "(cherry picked from commit 84d60721d886557d75b57d5b8e6cb69b2ae7d135)"', expected: 'deny', label: 'company: cherry-pick provenance line' });
scenario({ command: 'git commit -m "feat: x \u{1F916}"', expected: 'deny', label: 'company: robot emoji in the message' });
scenario({ setup: (world) => world.write('msg.txt', 'feat: x\n\nCo-Authored-By: A <a@x.test>\n'), command: 'git commit -F msg.txt', expected: 'deny', label: 'company: attribution in a -F message file' });
scenario({ command: "git commit -F - <<'EOF'\nfeat: x\n\nGenerated with a tool\nEOF", expected: 'deny', label: 'company: attribution in a -F - heredoc body', mention: 'stdin' });
scenario({ setup: (world) => { world.write('src/b.ts', 'b\n'); world.commit('feat: b\n\nCo-Authored-By: Someone <s@x.test>'); }, command: 'git commit --allow-empty -C HEAD', expected: 'deny', label: 'company: -C HEAD reusing a message with an attribution trailer', mention: 'reused message' });
scenario({ command: 'git commit -m "test(visual): regenerated with the update script"', expected: 'allow', label: 'NEAR MISS: "regenerated with" is not "generated with"' });
scenario({ command: 'git commit -m "feat: the user-agent header" -m "ensure:harness-generated) with care"', expected: 'allow', label: 'NEAR MISS: a clause break between "generated" and "with"' });
scenario({ world: personal, setup: stage('.cursor/rules.mdc', 'x\n'), command: 'git commit -m "feat: x" -m "Co-Authored-By: Someone"', expected: 'allow', label: 'personal repository: tool paths and attribution are never judged' });

// --- other repositories.
scenario({ world: personal, setup: stage('.claude/settings.json', 'by Claude\n'), command: 'git commit -m "chore: claude config, Anthropic"', expected: 'allow', label: 'personal repository: names everywhere, never judged' });
scenario({ command: 'git commit -m "claude"', cwd: join(personal.repo, '..'), expected: 'allow', label: 'a directory that is no repository is never judged' });
scenario({ command: `git -C "${company.repo}" commit -m "claude"`, cwd: join(company.repo, '..'), expected: 'deny', label: 'git -C into the company repository, cwd elsewhere' });
scenario({ command: `git -C "${personal.repo}" commit -m "claude"`, cwd: company.repo, expected: 'allow', label: 'git -C into the PERSONAL repository from a company cwd is not judged' });
scenario({ command: 'cd "$UNSET_DIRECTORY" && git commit -m "claude"', expected: 'deny', label: 'an unfollowable cd falls back to the directory the line started in' });
scenario({ command: `cd "${company.repo}" && git commit -m "claude"`, cwd: join(company.repo, '..'), expected: 'deny', label: 'a cd into the company repository' });

scenario({ setup: stage('.claude/new.md', 'x\n'), command: 'git commit -m "docs: readme only" -- README.md', expected: 'allow', label: 'company: a staged tainted file OUTSIDE the explicit pathspec is not part of this commit' });
scenario({ command: "git commit -F /dev/stdin <<'EOF'\nfeat: x\n\nvia Copilot\nEOF", expected: 'deny', label: 'company: -F /dev/stdin heredoc body' });
report(verdictOf(`﻿${payloadAt('Bash', company.repo, 'git commit -m "claude"')}`).verdict === 'deny', 'a payload with a leading BOM is still judged');

// --- a repository with NO commit yet has no HEAD to compare with.
{
  const fresh = createCompanyWorld({ seed: false });

  fresh.write('src/a.ts', '// Claude\n');
  fresh.git('add', '-A');
  report(verdictOf(payloadAt('Bash', fresh.repo, 'git commit -a -m "feat: first"')).verdict === 'deny', 'company, no commit yet: -a falls back to the index and still judges the content');
  fresh.cleanup();
  process.env.CLAUDE_COMPANY_CONFIG = companyConfigFile;
}

// --- the argument parser on its own.
{
  const parsed = (...args) => JSON.stringify(parseCommitArguments(args));
  const shape = (overrides) => JSON.stringify({ texts: [], files: [], reuse: [], paths: [], all: false, only: false, ...overrides });

  report(parsed('-m') === shape({}), 'a dangling -m records nothing');
  report(parsed('-mx', 'a.txt') === shape({ texts: [{ label: 'commit message', text: 'x' }], paths: ['a.txt'] }), '-mX takes the rest of the word and no extra word');
  report(parsed('-am', 'x') === shape({ texts: [{ label: 'commit message', text: 'x' }], all: true }), '-am: a sets all, m takes the next word');
  report(parsed('--message=a=b') === shape({ texts: [{ label: 'commit message', text: 'a=b' }] }), '--message=value keeps an = inside the value');
  report(parsed('--cleanup', 'strip', 'a.txt') === shape({ paths: ['a.txt'] }), 'a flag with a separate value does not turn that value into a path');
  report(parsed('--all', '--only') === shape({ all: true, only: true }), '--all and --only');
  report(parsed('-o', '-F', 'f.txt', '-C', 'abc') === shape({ only: true, files: ['f.txt'], reuse: ['abc'] }), '-o, -F file and -C commit');
  report(parsed('--file=f.txt', '--reuse-message', 'abc') === shape({ files: ['f.txt'], reuse: ['abc'] }), '--file=f and --reuse-message c');
  report(parsed('--author', 'A B', '--trailer=T: v') === shape({ texts: [{ label: 'commit author', text: 'A B' }, { label: 'commit trailer', text: 'T: v' }] }), '--author and --trailer are texts with their own labels');
  report(parsed('-m', 'x', '--', '-m', 'a.txt') === shape({ texts: [{ label: 'commit message', text: 'x' }], paths: ['-m', 'a.txt'] }), 'everything after -- is a path');
}

// --- the DATA face.
scenario({ command: 'echo "git commit -m claude"', expected: 'allow', label: 'DATA: the refused shape only ECHOED' });
scenario({ command: "cat <<'EOF' > note.txt\ngit commit -m \"claude\"\nEOF", expected: 'allow', label: 'DATA: the refused shape inside a heredoc body' });
scenario({ command: 'git commit -m "docs: explain the git commit -m rule"', expected: 'allow', label: 'DATA: a commit mentioned inside another commit\'s clean message' });
scenario({ command: 'git log --grep claude', expected: 'allow', label: 'a non-commit git command naming a tool' });
scenario({ command: 'git push origin main', expected: 'allow', label: 'a push is none of this guard\'s business' });

// --- shells and callers.
scenario({ tool: 'PowerShell', command: 'git commit -m "feat: with Claude"', expected: 'deny', label: 'PowerShell: name in the message' });
scenario({ tool: 'PowerShell', setup: stage('src/a.ts', 'x\n'), command: 'git commit -m "feat: clean"', expected: 'allow', label: 'PowerShell: clean commit' });
scenario({ command: 'git commit -m "claude"', expected: 'deny', label: 'a SUBAGENT caller is judged exactly like the main session', extra: { agent_id: 'a9fcd54b98e5f304a', agent_type: 'general-purpose' } });

// --- fail closed on the list; fail open on garbage.
process.env.CLAUDE_COMPANY_CONFIG = join(company.repo, '..', 'absent.json');
scenario({ command: 'git commit -m "feat: perfectly clean"', expected: 'deny', label: 'MISSING LIST: even a clean commit is refused (fail closed)', mention: 'missing or empty' });
scenario({ world: personal, command: 'git commit -m "feat: perfectly clean"', expected: 'deny', label: 'MISSING LIST: a personal repository too, because the guard cannot tell without the list' });
scenario({ command: 'git status', expected: 'allow', label: 'MISSING LIST: a non-commit command is not affected' });
process.env.CLAUDE_COMPANY_CONFIG = companyConfigFile;

for (const [input, label] of [['NOT JSON AT ALL', 'garbage payload'], ['', 'empty payload'], ['﻿NOT JSON', 'BOM + garbage'], [JSON.stringify({ tool_name: 'Bash', tool_input: {} }), 'no command'], [JSON.stringify({ tool_name: 'NotAShell', tool_input: { command: 'git commit -m claude' }, cwd: company.repo }), 'a tool with no shell dialect']]) {
  const result = verdictOf(input);

  report(result.verdict === 'allow' && result.code === 0, `fail-open: ${label}`);
}

// --- both languages in the refusal.
{
  company.write('src/a.ts', '// Claude\n');
  company.git('add', '-A');

  const denied = verdictOf(payloadAt('Bash', company.repo, 'git commit -m "x"')).output;

  reset(company);
  report(denied.includes('COMPANY-COMMIT GUARD REFUSED') && denied.includes('@es COMPANY-COMMIT GUARD RECHAZÓ'), 'the refusal carries the English headline and its @es Spanish mirror');
  report(denied.split('src/a.ts:1').length === 3, 'the findings are listed once in each language');
  report(denied.includes('Quita el nombre del mensaje') && denied.includes('Remove the name from the message'), 'each language states the remedy');
}

// --- through the REAL dispatcher, with a real-shaped payload. The manifest holds only this guard so the proof
// does not depend on every other guard of the fleet being present; the registration in the real manifest is
// asserted separately below.
{
  const ownManifest = join(company.repo, '..', 'own-manifest.json');

  writeFileSync(ownManifest, JSON.stringify({ event: 'PreToolUse', guards: [GUARD] }));
  process.env.CLAUDE_COMPANY_CONFIG = companyConfigFile;
  company.write('src/a.ts', '// Claude\n');
  company.git('add', '-A');

  const refused = await dispatch(ownManifest, payloadAt('Bash', company.repo, 'git commit -m "x"'));
  const reason = refused.output?.hookSpecificOutput?.permissionDecisionReason ?? '';

  reset(company);
  company.write('src/a.ts', 'export const a = 1;\n');
  company.git('add', '-A');

  const allowed = await dispatch(ownManifest, payloadAt('Bash', company.repo, 'git commit -m "feat: a"'));
  const allowedReason = allowed.output?.hookSpecificOutput?.permissionDecisionReason ?? '';

  reset(company);
  report(reason.includes('COMPANY-COMMIT GUARD REFUSED') && refused.problems.length === 0, 'dispatch.mjs: a company commit naming a tool is refused through its own registration');
  report(!allowedReason.includes('COMPANY-COMMIT GUARD') && allowed.problems.length === 0, 'dispatch.mjs: a clean company commit passes through its own registration');
}

// --- the same through the dispatcher for the NEW families: a tool path and an attribution trailer (hit), CSS and
// "regenerated with" (near miss), each with a real-shaped Bash payload.
{
  const ownManifest = join(company.repo, '..', 'own-manifest.json');
  const refusalOf = async (setup, command) => {
    setup(company);

    const result = await dispatch(ownManifest, payloadAt('Bash', company.repo, command));

    reset(company);

    return { reason: result.output?.hookSpecificOutput?.permissionDecisionReason ?? '', problems: result.problems.length };
  };
  const pathHit = await refusalOf(stage('.cursor/rules/a.mdc', 'x\n'), 'git commit -m "chore: rules"');
  const trailerHit = await refusalOf(() => {}, 'git commit -m "feat: x" -m "Co-Authored-By: Someone <s@x.test>"');
  const cssMiss = await refusalOf(stage('src/cursor-styles.css', '.a { cursor: pointer; }\n'), 'git commit -m "style: pointer"');
  const wordingMiss = await refusalOf(() => {}, 'git commit -m "test: regenerated with the update script"');

  report(pathHit.reason.includes('COMPANY-COMMIT GUARD REFUSED') && pathHit.reason.includes('.cursor/') && pathHit.problems === 0, 'dispatch.mjs: a staged .cursor/ path is refused, naming the term');
  report(trailerHit.reason.includes('COMPANY-COMMIT GUARD REFUSED') && trailerHit.reason.includes('co authored by') && trailerHit.problems === 0, 'dispatch.mjs: a Co-Authored-By trailer is refused, naming the phrase');
  report(!cssMiss.reason.includes('COMPANY-COMMIT GUARD') && cssMiss.problems === 0, 'dispatch.mjs: NEAR MISS, "cursor:" in CSS passes');
  report(!wordingMiss.reason.includes('COMPANY-COMMIT GUARD') && wordingMiss.problems === 0, 'dispatch.mjs: NEAR MISS, "regenerated with" passes');
}

// --- the wiring.
try {
  const declaration = JSON.parse(readFileSync(join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const declared = String(declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher ?? '').split('|');

  for (const tool of declared) report(dialectOfTool(tool) !== undefined, `the declaration registers ${tool}, which the decision knows a dialect for`);

  report(declared.length === 2 && JSON.parse(readFileSync(MANIFEST, 'utf8')).guards.includes('../../company-commit-guard/guard.mjs'), 'the guard is registered in pretooluse-shell.json for Bash and PowerShell');
} catch (error) {
  report(false, `the registration is unreadable: ${error instanceof Error ? error.message : String(error)}`);
}

company.cleanup();
personal.cleanup();
rmSync(join(HERE, 'state'), { recursive: true, force: true });
console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
