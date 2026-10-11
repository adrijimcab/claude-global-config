#!/usr/bin/env node
/**
 * Self-test for company-push-guard, on constructed repositories whose `origin` has a fetch URL on a
 * SIMULATED company host and a push URL that is a real bare repository (`selftest-fixtures/company-world.mjs`).
 * The state space the decision ranges over: where the name sits in the pushed range (message, added line,
 * added path, an early commit of several), what the remote already has (history already pushed is not
 * re-judged), a NEW branch with no remote-tracking ref, the destination (company, personal, raw company URL,
 * raw personal URL), `--no-verify`, `-n` (a dry run, judged normally), the refspec forms (HEAD, src:dst,
 * deletions, `--delete`, `--all`, `--tags`), a missing configuration (fail closed), the DATA face, both
 * shells, a subagent caller, fail-open input, and the same decisions through `hook-dispatch/dispatch.mjs`.
 *
 * @es Auto-test sobre repositorios construidos con `origin` de fetch en un host de empresa SIMULADO y de
 * push en un bare real. Cubre dónde está el nombre en el rango subido, qué tiene ya el remoto, una rama
 * NUEVA sin ref de seguimiento, el destino (empresa, personal, URL cruda de empresa y personal),
 * `--no-verify`, `-n` (un dry-run se juzga normal), las formas de refspec, configuración ausente (falla
 * cerrado), la cara DATO, ambos shells, un subagente, entrada basura y el paso por `dispatch.mjs`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { COMPANY_URL, PERSONAL_URL, createCompanyWorld } from '../selftest-fixtures/company-world.mjs';
import { parsePushArguments } from './push-arguments.mjs';

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

process.env.CLAUDE_COMPANY_CONFIG = companyConfigFile;

/** The commit each world starts from, which is also what its remote has. @es El commit de partida, que también tiene el remoto. */
const BASE = new Map([company, personal].map((world) => [world, world.git('rev-parse', 'HEAD').stdout.trim()]));

/** Back to the pushed state: main at the base, no other branch, no tag. @es Vuelve al estado subido. */
function reset(world) {
  world.git('checkout', '-q', '-f', 'main');
  world.git('reset', '-q', '--hard', BASE.get(world));
  world.git('clean', '-fdq');

  for (const line of world.git('for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/tags').stdout.split('\n')) {
    const name = line.trim();

    if (name && name !== 'main') world.git('branch', '-D', name);
    if (name && name !== 'main') world.git('tag', '-d', name);
  }
}

/** Commits one file in `world`. @es Commitea un fichero en `world`. */
const commitFile = (world, file, text, message) => {
  world.write(file, text);
  world.commit(message);
};

/**
 * One case: `setup(world)` shapes the history, the command runs with `cwd`, and the verdict must match.
 * @es Un caso: `setup(world)` prepara la historia, se corre el comando y el veredicto debe coincidir.
 */
function scenario({ world = company, setup = () => {}, teardown = () => {}, command, expected, label, tool = 'Bash', cwd = world.repo, mention, extra }) {
  setup(world);

  const result = verdictOf(payloadAt(tool, cwd, command, extra));
  const mentionOk = mention === undefined || result.output.includes(mention);

  teardown(world);
  reset(world);
  report(result.verdict === expected && result.code === 0 && mentionOk, `expected=${expected} actual=${result.verdict} exit=${result.code}  ${label}${mentionOk ? '' : `  [the refusal never named: ${mention}]`}`);
}

const clean = (world) => commitFile(world, 'src/a.ts', 'export const a = 1;\n', 'feat(a): add the constant');
const taintedMessage = (world) => commitFile(world, 'src/a.ts', 'export const a = 1;\n', 'feat(a): add the constant with Claude');
const taintedLine = (world) => commitFile(world, 'src/a.ts', 'ok\n// generated by Claude\n', 'feat(a): add the file');
const taintedPath = (world) => commitFile(world, '.claude/notes.md', 'plain\n', 'docs: add notes');
const onBranch = (name, then) => (world) => {
  world.git('checkout', '-q', '-b', name);
  then(world);
};

// --- the pushed range of an existing branch.
scenario({ setup: clean, command: 'git push origin main', expected: 'allow', label: 'company: clean range is allowed' });
scenario({ setup: taintedMessage, command: 'git push origin main', expected: 'deny', label: 'company: name in a commit message', mention: 'message' });
scenario({ setup: taintedLine, command: 'git push origin main', expected: 'deny', label: 'company: name in an added line, located as file:line', mention: 'src/a.ts:2' });
scenario({ setup: taintedPath, command: 'git push origin main', expected: 'deny', label: 'company: name in an added path', mention: '.claude/notes.md' });
scenario({ setup: (world) => { taintedMessage(world); commitFile(world, 'src/b.ts', 'b\n', 'feat(b): add b'); commitFile(world, 'src/c.ts', 'c\n', 'feat(c): add c'); }, command: 'git push origin main', expected: 'deny', label: 'company: a tainted commit EARLY in a range of three' });
scenario({ setup: (world) => commitFile(world, 'src/claudette.ts', 'const copilots = 1;\n', 'feat: claudette and copilots'), command: 'git push origin main', expected: 'allow', label: 'company: NEAR MISS claudette / copilots in message, path and line' });
scenario({ setup: (world) => { taintedMessage(world); world.git('rm', '-q', 'src/a.ts'); world.commit('fix: remove it again'); }, command: 'git push origin main', expected: 'deny', label: 'company: a tainted commit stays tainted even when a later commit removes the file' });
scenario({ setup: clean, command: 'git push', expected: 'allow', label: 'company: no arguments, upstream default (origin), clean' });
scenario({ setup: taintedMessage, command: 'git push', expected: 'deny', label: 'company: no arguments resolve to origin, which is a company remote' });
scenario({ setup: taintedMessage, command: 'git push -u origin HEAD', expected: 'deny', label: 'company: -u origin HEAD' });
scenario({ setup: onBranch('feature', taintedMessage), command: 'git push origin feature:main', expected: 'deny', label: 'company: src:dst refspec judges the SOURCE' });
scenario({ setup: onBranch('feature', clean), command: 'git push origin feature:main', expected: 'allow', label: 'company: src:dst refspec, clean source' });
scenario({ setup: taintedMessage, command: 'git push origin +main', expected: 'deny', label: 'company: forced refspec' });

// --- what the remote already has is not judged again.
{
  const pushed = createCompanyWorld();

  process.env.CLAUDE_COMPANY_CONFIG = companyConfigFile;
  commitFile(pushed, 'src/old.ts', 'old\n', 'feat: written with Claude, pushed long ago');
  pushed.git('push', '-q', 'origin', 'main');
  commitFile(pushed, '.claude/legacy.md', 'x\n', 'chore: legacy notes');
  pushed.git('push', '-q', 'origin', 'main');
  pushed.git('rm', '-q', '.claude/legacy.md');
  pushed.commit('chore: remove the legacy notes');
  commitFile(pushed, 'src/new.ts', 'new\n', 'feat: a clean new commit');

  const result = verdictOf(payloadAt('Bash', pushed.repo, 'git push origin main'));

  const byUrl = verdictOf(payloadAt('Bash', pushed.repo, `git push ${COMPANY_URL} main`));

  report(result.verdict === 'allow' && result.code === 0, 'company: history the remote ALREADY has (tracking ref advanced) is not judged again, only the new commit');
  report(byUrl.verdict === 'allow' && byUrl.code === 0, 'company: the same through a RAW company URL, narrowed by the tracking refs of the company remotes');
  pushed.cleanup();
}

// --- a NEW branch: no remote-tracking ref for it.
scenario({ setup: onBranch('feature', taintedLine), command: 'git push -u origin feature', expected: 'deny', label: 'company: NEW branch, tainted commit' });
scenario({ setup: onBranch('feature', clean), command: 'git push -u origin feature', expected: 'allow', label: 'company: NEW branch, clean commit' });
scenario({ setup: (world) => world.git('branch', 'feature'), command: 'git push -u origin feature', expected: 'allow', label: 'company: NEW branch that adds no commit beyond what the remote has' });
scenario({ setup: onBranch('feature', (world) => { clean(world); world.git('checkout', '-q', 'main'); }), command: 'git push origin main', expected: 'allow', label: 'company: pushing main does not judge commits that only another branch holds' });

// --- bulk selectors and deletions.
scenario({ setup: onBranch('feature', (world) => { taintedMessage(world); world.git('checkout', '-q', 'main'); }), command: 'git push --all origin', expected: 'deny', label: 'company: --all judges branches other than the current one' });
scenario({ setup: (world) => { taintedMessage(world); world.git('tag', 'v1'); world.git('reset', '-q', '--hard', BASE.get(world)); }, command: 'git push origin --tags', expected: 'deny', label: 'company: --tags judges a tagged commit that no branch holds' });
scenario({ setup: taintedMessage, command: 'git push origin :old-branch', expected: 'allow', label: 'company: a deletion refspec sends no commit, so the tainted local commit is not judged' });
scenario({ setup: onBranch('feature', (world) => { taintedMessage(world); world.git('checkout', '-q', 'main'); }), command: 'git push origin "refs/heads/*:refs/heads/*"', expected: 'deny', label: 'company: a glob refspec judges every matching branch' });
scenario({ setup: taintedMessage, command: 'git push origin main no-such-branch', expected: 'deny', label: 'company: an unresolvable refspec source does not hide the resolvable one' });
scenario({ setup: taintedMessage, command: 'git push --delete origin main', expected: 'allow', label: 'company: --delete sends no commit even when the named ref exists locally' });
scenario({ setup: onBranch('feature', (world) => { taintedMessage(world); world.git('checkout', '-q', 'main'); }), command: 'git push --mirror origin', expected: 'deny', label: 'company: --mirror judges branches other than the current one' });
scenario({ setup: taintedMessage, command: 'git push --delete origin old-branch', expected: 'allow', label: 'company: --delete sends no commit' });
scenario({ setup: taintedMessage, command: 'git push --mirror origin', expected: 'deny', label: 'company: --mirror' });

// --- --no-verify and -n.
scenario({ setup: clean, command: 'git push --no-verify origin main', expected: 'deny', label: 'company: --no-verify is refused even for a clean range', mention: '--no-verify' });
scenario({ setup: clean, command: 'git push origin main --no-verify', expected: 'deny', label: 'company: --no-verify after the refspec' });
scenario({ setup: clean, command: 'git push -n origin main', expected: 'allow', label: 'company: -n is --dry-run for a push, not --no-verify: judged on the range, clean' });
scenario({ setup: taintedMessage, command: 'git push -n origin main', expected: 'deny', label: 'company: -n with a tainted range is still refused' });
scenario({ world: personal, setup: taintedMessage, command: 'git push --no-verify origin main', expected: 'allow', label: 'personal: --no-verify is none of this guard\'s business' });

// --- how a push with no repository word picks its remote, and a remote whose URLs differ.
const withPersonalRemote = (world) => world.git('remote', 'add', 'other', PERSONAL_URL);
const dropPersonalRemote = (world) => {
  world.git('config', '--unset-all', 'remote.pushDefault');
  world.git('config', '--unset-all', 'branch.main.pushRemote');
  world.git('config', '--unset-all', 'branch.main.remote');
  world.git('remote', 'remove', 'other');
};

scenario({ setup: (world) => { withPersonalRemote(world); world.git('config', 'branch.main.pushRemote', 'other'); taintedMessage(world); }, teardown: dropPersonalRemote, command: 'git push', expected: 'allow', label: 'branch.<b>.pushRemote sends a bare `git push` to a personal remote: not judged' });
scenario({ setup: (world) => { withPersonalRemote(world); world.git('config', 'remote.pushDefault', 'other'); taintedMessage(world); }, teardown: dropPersonalRemote, command: 'git push', expected: 'allow', label: 'remote.pushDefault sends a bare `git push` to a personal remote: not judged' });
scenario({ setup: (world) => { withPersonalRemote(world); world.git('config', 'branch.main.remote', 'other'); taintedMessage(world); }, teardown: dropPersonalRemote, command: 'git push', expected: 'allow', label: 'branch.<b>.remote sends a bare `git push` to a personal remote: not judged' });
scenario({
  setup: (world) => {
    world.git('remote', 'add', 'split', PERSONAL_URL);
    world.git('remote', 'set-url', '--push', 'split', COMPANY_URL);
    taintedMessage(world);
  },
  teardown: (world) => world.git('remote', 'remove', 'split'),
  command: 'git push split main',
  expected: 'deny',
  label: 'a remote whose FETCH url is personal but whose PUSH url is the company host is a company remote'
});
scenario({ setup: taintedMessage, command: `cd "$UNSET_DIRECTORY" && git push ${COMPANY_URL} main`, expected: 'deny', label: 'an unfollowable cd falls back to the directory the line started in, so the range of that repository is judged' });

// --- the destination.
scenario({ world: personal, setup: taintedMessage, command: 'git push origin main', expected: 'allow', label: 'personal remote: names in the range, never judged' });
scenario({ setup: taintedMessage, command: `git push ${COMPANY_URL} main`, expected: 'deny', label: 'a RAW company URL is judged by its host' });
scenario({ setup: taintedMessage, command: `git push ${PERSONAL_URL} main`, expected: 'allow', label: 'a RAW personal URL is not judged, even from a company repository' });
scenario({ setup: taintedMessage, command: `git push --repo=${COMPANY_URL}`, expected: 'deny', label: '--repo=URL names the destination' });
scenario({ setup: taintedMessage, command: 'git push', cwd: personal.repo, world: company, expected: 'allow', label: 'a push run with cwd in the PERSONAL repository judges that repository, not the company one' });
scenario({ setup: taintedMessage, command: `git -C "${company.repo}" push origin main`, cwd: join(company.repo, '..'), expected: 'deny', label: 'git -C into the company repository, cwd elsewhere' });
scenario({ setup: taintedMessage, command: `cd "${company.repo}" && git push origin main`, cwd: join(company.repo, '..'), expected: 'deny', label: 'a cd into the company repository' });
scenario({ command: 'git push origin main', cwd: join(company.repo, '..'), expected: 'allow', label: 'a directory that is no repository is never judged' });

// --- the DATA face and other commands.
scenario({ setup: taintedMessage, command: 'echo "git push --no-verify origin main"', expected: 'allow', label: 'DATA: the refused shape only ECHOED' });
scenario({ setup: taintedMessage, command: "cat <<'EOF' > note.txt\ngit push origin main\nEOF", expected: 'allow', label: 'DATA: the refused shape inside a heredoc body' });
scenario({ setup: taintedMessage, command: 'git commit -m "docs: explain git push --no-verify"', expected: 'allow', label: 'DATA: a push mentioned inside a commit message' });
scenario({ setup: taintedMessage, command: 'git log --oneline', expected: 'allow', label: 'a non-push git command' });

// --- shells and callers.
scenario({ setup: taintedMessage, tool: 'PowerShell', command: 'git push origin main', expected: 'deny', label: 'PowerShell: tainted range' });
scenario({ setup: clean, tool: 'PowerShell', command: 'git push origin main', expected: 'allow', label: 'PowerShell: clean range' });
scenario({ setup: taintedMessage, command: 'git push origin main', expected: 'deny', label: 'a SUBAGENT caller is judged exactly like the main session', extra: { agent_id: 'a9fcd54b98e5f304a', agent_type: 'general-purpose' } });

// --- fail closed on the list; fail open on garbage.
process.env.CLAUDE_COMPANY_CONFIG = join(company.repo, '..', 'absent.json');
scenario({ setup: clean, command: 'git push origin main', expected: 'deny', label: 'MISSING LIST: even a clean push is refused (fail closed)', mention: 'missing or empty' });
scenario({ world: personal, setup: clean, command: 'git push origin main', expected: 'deny', label: 'MISSING LIST: a personal push too, because the guard cannot tell without the list' });
scenario({ command: 'git status', expected: 'allow', label: 'MISSING LIST: a non-push command is not affected' });
process.env.CLAUDE_COMPANY_CONFIG = companyConfigFile;

for (const [input, label] of [['NOT JSON AT ALL', 'garbage payload'], ['', 'empty payload'], ['﻿NOT JSON', 'BOM + garbage'], [JSON.stringify({ tool_name: 'Bash', tool_input: {} }), 'no command'], [JSON.stringify({ tool_name: 'NotAShell', tool_input: { command: 'git push --no-verify' }, cwd: company.repo }), 'a tool with no shell dialect']]) {
  const result = verdictOf(input);

  report(result.verdict === 'allow' && result.code === 0, `fail-open: ${label}`);
}

report(verdictOf(`﻿${payloadAt('Bash', company.repo, 'git push --no-verify origin main')}`).verdict === 'deny', 'a payload with a leading BOM is still judged');

// --- the argument parser on its own.
{
  const parsed = (...args) => JSON.stringify(parsePushArguments(args));
  const shape = (overrides) => JSON.stringify({ repository: undefined, refspecs: [], noVerify: false, all: false, tags: false, mirror: false, deleting: false, ...overrides });

  report(parsed() === shape({}), 'no arguments');
  report(parsed('origin', 'main', 'dev:prod') === shape({ repository: 'origin', refspecs: ['main', 'dev:prod'] }), 'the first positional is the repository, the rest are refspecs');
  report(parsed('--repo', 'u', 'main') === shape({ repository: 'u', refspecs: ['main'] }), '--repo X: every positional is a refspec');
  report(parsed('--repo=u', 'main') === shape({ repository: 'u', refspecs: ['main'] }), '--repo=X');
  report(parsed('-u', '-f', 'origin', 'main') === shape({ repository: 'origin', refspecs: ['main'] }), 'short flags without values are skipped');
  report(parsed('-o', 'ci.skip', 'origin', 'main') === shape({ repository: 'origin', refspecs: ['main'] }), '-o takes the next word as its value');
  report(parsed('--push-option', 'x', 'origin') === shape({ repository: 'origin' }), 'a long flag with a separate value consumes it');
  report(parsed('--force-with-lease', 'origin', 'main') === shape({ repository: 'origin', refspecs: ['main'] }), '--force-with-lease takes no separate value');
  report(parsed('--no-verify', '--all', '--tags', '--mirror', '--delete') === shape({ noVerify: true, all: true, tags: true, mirror: true, deleting: true }), 'the selector flags');
  report(parsed('-d', 'origin', 'b') === shape({ deleting: true, repository: 'origin', refspecs: ['b'] }), '-d deletes');
  report(parsed('-n', 'origin') === shape({ repository: 'origin' }), '-n is NOT --no-verify');
  report(parsed('--', 'origin', 'main') === shape({ repository: 'origin', refspecs: ['main'] }), 'everything after -- is positional');
}

// --- both languages in the refusals.
{
  taintedLine(company);

  const denied = verdictOf(payloadAt('Bash', company.repo, 'git push origin main')).output;

  clean(company);
  reset(company);
  clean(company);

  const noVerify = verdictOf(payloadAt('Bash', company.repo, 'git push --no-verify origin main')).output;

  reset(company);
  report(denied.includes('COMPANY-PUSH GUARD REFUSED') && denied.includes('@es COMPANY-PUSH GUARD RECHAZÓ'), 'the findings refusal carries the English headline and its @es Spanish mirror');
  report(denied.split('src/a.ts:2').length === 3, 'the findings are listed once in each language');
  report(denied.includes('Reescribe los commits') && denied.includes('Rewrite the offending commits'), 'each language states the remedy');
  report(noVerify.includes('COMPANY-PUSH GUARD REFUSED') && noVerify.includes('@es COMPANY-PUSH GUARD RECHAZÓ') && noVerify.includes('Haz el push sin') && noVerify.includes('Run the push without'), 'the --no-verify refusal carries both languages');
}

// --- through the REAL dispatcher, with a real-shaped payload. The manifest holds only this guard so the proof
// does not depend on every other guard of the fleet being present; the registration in the real manifest is
// asserted separately below.
{
  const ownManifest = join(company.repo, '..', 'own-manifest.json');

  writeFileSync(ownManifest, JSON.stringify({ event: 'PreToolUse', guards: [GUARD] }));
  taintedMessage(company);

  const refused = await dispatch(ownManifest, payloadAt('Bash', company.repo, 'git push origin main'));
  const reason = refused.output?.hookSpecificOutput?.permissionDecisionReason ?? '';

  reset(company);
  clean(company);

  const allowed = await dispatch(ownManifest, payloadAt('Bash', company.repo, 'git push origin main'));
  const allowedReason = allowed.output?.hookSpecificOutput?.permissionDecisionReason ?? '';

  reset(company);
  report(reason.includes('COMPANY-PUSH GUARD REFUSED') && refused.problems.length === 0, 'dispatch.mjs: a company push naming a tool is refused through its own registration');
  report(!allowedReason.includes('COMPANY-PUSH GUARD') && allowed.problems.length === 0, 'dispatch.mjs: a clean company push passes through its own registration');
}

// --- the wiring.
try {
  const declaration = JSON.parse(readFileSync(join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const declared = String(declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher ?? '').split('|');

  for (const tool of declared) report(dialectOfTool(tool) !== undefined, `the declaration registers ${tool}, which the decision knows a dialect for`);

  report(declared.length === 2 && JSON.parse(readFileSync(MANIFEST, 'utf8')).guards.includes('../../company-push-guard/guard.mjs'), 'the guard is registered in pretooluse-shell.json for Bash and PowerShell');
} catch (error) {
  report(false, `the registration is unreadable: ${error instanceof Error ? error.message : String(error)}`);
}

company.cleanup();
personal.cleanup();
rmSync(join(HERE, 'state'), { recursive: true, force: true });
console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
