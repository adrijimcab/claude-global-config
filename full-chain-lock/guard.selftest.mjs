#!/usr/bin/env node
/**
 * Self-test for the full-chain guard (`guard.mjs`, `chain-invocations.mjs`, `chains-config.mjs`, `refusal.mjs`).
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - THE DECLARATION: the real `chains.json` loads and holds the chains the owner named (b100-am-ui, Discovery-FE,
 *     the selftest runners); every malformed shape is refused with a bilingual error naming the file.
 *   - WHAT RUNS: each declared script of each project, spelled `npm run`, `npm run-script`, `pnpm run`, `yarn`,
 *     `pnpm`, behind `cd ... &&`, `--prefix`, an environment prefix, a pipe, a redirect, `bash -c`; the selftest
 *     runner as `node <path>` with a relative, an absolute and a Windows path and with node options; PowerShell.
 *   - WHAT DOES NOT: the WRAPPED form (also for the selftest runner), `npm test -- foo.spec`, other scripts, a
 *     chain only MENTIONED (echo, commit message, heredoc, comment), other node programs, near-miss names.
 *   - WHO CALLS: the main session and a delegated worker are both held to it.
 *   - THE ANSWER: `deny`, English first, ` @es ` Spanish, the exact runner command (path that exists, chain, project,
 *     session, the original command after `--`); that command passes the guard itself (round trip).
 *   - FAILING OPEN: malformed JSON, a BOM-prefixed payload still decided, a non-shell tool, no command, a declaration
 *     that cannot be read, a decision that throws.
 *   - THE REGISTERED HOOK: the dispatcher manifest lists the guard, the registration says PreToolUse on Bash|PowerShell,
 *     settings.json runs that manifest, and a real-shaped payload through `hook-dispatch/dispatch.mjs` is refused.
 *
 * @es Auto-test del guard de cadenas completas. Estados: la DECLARACIÓN (la real carga; cada forma mal formada se
 * rechaza en dos idiomas), QUÉ EJECUTA una línea (cada script declarado con cada gestor y forma de llegar a él, el
 * runner de selftests, PowerShell), QUÉ NO (la forma envuelta, `npm test`, otros scripts, las menciones, otros
 * programas, casi-aciertos), QUIÉN llama (sesión principal y workers), LA RESPUESTA (deny, bilingüe, el comando exacto
 * del runner, que a su vez pasa el guard), FALLAR ABIERTO y EL HOOK REGISTRADO.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { fullChainInvocations } from './chain-invocations.mjs';
import { DECLARATION, loadChains } from './chains-config.mjs';
import { evaluate } from './guard.mjs';
import { MESSAGES } from './messages.mjs';
import { wrappedCommand } from './refusal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const GUARD = path.join(HERE, 'guard.mjs');
const RUNNER = path.join(HERE, 'run.mjs').split('\\').join('/');

isolateState('full-chain-lock');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}\n`);
  }
}

/** A main-session payload: the recording minus its subagent identity. @es Un payload de sesión principal. */
function asMain(tool, command) {
  const { agent_id: _agentId, agent_type: _agentType, ...rest } = payloadFor(tool, command, { sessionId: 'sess-main' });

  return { ...rest, cwd: ROOT };
}

/** A delegated worker's payload. @es El payload de un worker delegado. */
const asWorker = (tool, command) => ({ ...asMain(tool, command), agent_id: 'worker-1', agent_type: 'general-purpose' });

const decide = (payload) => evaluate(JSON.stringify(payload));
const verdictOf = (payload) => decide(payload)?.hookSpecificOutput?.permissionDecision;

function expect(verdict, command, tool = 'Bash') {
  const actual = verdictOf(asMain(tool, command));

  check(`${verdict}: ${tool}: ${command}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

// ── The declaration ─────────────────────────────────────────────────────────────────────────────────────────
const chains = loadChains();
const declared = (project) => chains.projects.find((entry) => entry.project === project);

check('the real declaration loads', chains.projects.length >= 3);
check('b100-am-ui declares its full chains', ['build:ci-pr', 'ci:test', 'check:mutation', 'check:a11y'].every((script) => declared('b100-am-ui')?.scripts.includes(script)));
check('Discovery-FE declares its full chains', ['build:ci', 'build:ci-pr', 'test:all'].every((script) => declared('di_1700002_discovery_fe')?.scripts.includes(script)));
check('the selftest runners are declared', ['selftest-runner/run.mjs', 'fleet-kit/selftest-all.mjs'].every((command) => declared('claude-global')?.commands.includes(command)));
check('the message table is bilingual', messageProblems(MESSAGES).length === 0);

{
  const problem = (text) => { try { loadChains('declaration.json', () => text); return undefined; } catch (error) { return error.message; } };
  const bad = (label, value) => {
    const message = problem(typeof value === 'string' ? value : JSON.stringify(value));

    check(`a malformed declaration is refused: ${label}`, message !== undefined && message.includes('declaration.json') && message.includes('@es'), String(message));
  };

  bad('not JSON', 'not json');
  bad('no projects', {});
  bad('empty projects', { projects: [] });
  bad('a project without a name', { projects: [{ scripts: ['a'], commands: [] }] });
  bad('a blank name', { projects: [{ project: ' ', scripts: ['a'], commands: [] }] });
  bad('scripts that are not a list', { projects: [{ project: 'p', scripts: 'a', commands: [] }] });
  bad('a blank script', { projects: [{ project: 'p', scripts: [' '], commands: [] }] });
  bad('commands that are not a list', { projects: [{ project: 'p', scripts: ['a'], commands: 5 }] });
  bad('a project that declares no chain', { projects: [{ project: 'p', scripts: [], commands: [] }] });
  bad('a project declared twice', { projects: [{ project: 'p', scripts: ['a'], commands: [] }, { project: 'p', scripts: ['b'], commands: [] }] });
  check('a valid minimal declaration loads', problem(JSON.stringify({ projects: [{ project: 'p', scripts: ['a'], commands: [] }] })) === undefined);

  const unreadable = (() => { try { loadChains('missing.json', () => { throw new Error('ENOENT'); }); return undefined; } catch (error) { return error.message; } })();

  check('an unreadable declaration is refused with its file named, bilingual', unreadable?.includes('missing.json') && unreadable.includes('@es'), String(unreadable));
  check('the declaration path is the file beside the module', path.dirname(DECLARATION) === HERE && existsSync(DECLARATION));
}

// ── What runs: refused ──────────────────────────────────────────────────────────────────────────────────────
for (const script of declared('b100-am-ui').scripts) expect('deny', `npm run ${script}`);
for (const script of declared('di_1700002_discovery_fe').scripts) expect('deny', `npm run ${script}`);

expect('deny', 'cd Discovery-FE && npm run build:ci-pr');
expect('deny', 'npm --prefix Discovery-FE run build:ci-pr');
expect('deny', 'npm -w b100-am-ui run ci:test');
expect('deny', 'npm run build:ci-pr -- --foo');
expect('deny', 'npm run-script ci:test');
expect('deny', 'pnpm run ci:test');
expect('deny', 'pnpm build:ci-pr');
expect('deny', 'yarn build:ci');
expect('deny', 'yarn run check:mutation');
expect('deny', 'CI=1 npm run build:ci-pr');
expect('deny', 'npm run build:ci-pr 2>&1 | tail -5');
expect('deny', 'bash -c "npm run ci:test"');
expect('deny', 'echo start && npm run check:a11y');
expect('deny', 'node selftest-runner/run.mjs');
expect('deny', 'node ~/.claude/selftest-runner/run.mjs --root x');
expect('deny', 'node C:/Users/adrian.jimenez/.claude/selftest-runner/run.mjs');
expect('deny', 'node C:\\Users\\adrian.jimenez\\.claude\\selftest-runner\\run.mjs', 'PowerShell');
expect('deny', 'node --experimental-sqlite fleet-kit/selftest-all.mjs');
expect('deny', 'npm run build:ci-pr', 'PowerShell');
expect('deny', '& npm run ci:test', 'PowerShell');
expect('deny', 'cd Discovery-FE; npm run build:ci', 'PowerShell');
expect('deny', 'node selftest-runner\\run.mjs', 'PowerShell');

// ── What does not run: allowed ──────────────────────────────────────────────────────────────────────────────
expect('allow', `node "${RUNNER}" --chain build:ci-pr --project b100-am-ui -- npm run build:ci-pr`);
expect('allow', `node "${RUNNER}" --chain selftest-runner/run.mjs -- node selftest-runner/run.mjs`);
expect('allow', `node "${RUNNER}" --chain build:ci-pr -- npm run build:ci-pr`, 'PowerShell');
expect('allow', 'npm test -- foo.spec');
expect('allow', 'npm run lint');
expect('allow', 'npm run build');
expect('allow', 'npm run test:app');
expect('allow', 'npm run build:ci-pr-extra');
expect('allow', 'npm install');
expect('allow', 'npm');
expect('allow', 'npm run');
expect('allow', 'node');
expect('allow', 'node scripts/foo.mjs');
expect('allow', 'node selftest-runner/other.mjs');
expect('allow', 'node my-selftest-runner/run.mjs');
expect('allow', 'ls selftest-runner/run.mjs');
expect('allow', 'cat selftest-runner/run.mjs');
expect('allow', 'echo "npm run build:ci-pr"');
expect('allow', "echo 'node selftest-runner/run.mjs'");
expect('allow', 'git commit -m "docs: mention npm run ci:test"');
expect('allow', 'cat <<EOF\nnpm run build:ci-pr\nEOF');
expect('allow', '# npm run ci:test');
expect('allow', 'git status');
expect('allow', 'npm test -- foo.spec', 'PowerShell');
expect('allow', 'Write-Output "npm run build:ci-pr"', 'PowerShell');

// ── Who calls ───────────────────────────────────────────────────────────────────────────────────────────────
check('a delegated worker is refused too', verdictOf(asWorker('Bash', 'npm run build:ci-pr')) === 'deny');
check('the main session is refused', verdictOf(asMain('Bash', 'npm run build:ci-pr')) === 'deny');
check('a worker running the wrapped form passes', verdictOf(asWorker('Bash', `node "${RUNNER}" --chain build:ci-pr -- npm run build:ci-pr`)) === undefined);

// ── The grammar of a package-manager line, on a declaration of its own ───────────────────────────────────────────
{
  const custom = { projects: [{ project: 'p', scripts: ['test', 'start', 'stop', 'restart', 'install', 'deploy'], commands: [] }, { project: 'q', scripts: ['deploy'], commands: ['tools/big.mjs'] }] };
  const found = (line, dialect = 'bash') => fullChainInvocations(line, dialect, custom).map((offender) => offender.chain);
  const options = ['--prefix x', '-C x', '-w x', '--workspace x', '--cache x', '--userconfig x', '--loglevel silent'];

  check('the lifecycle shorthands run the script of the same name: npm test', found('npm test').join() === 'test');
  check('the lifecycle shorthands run the script of the same name: npm start', found('npm start').join() === 'start');
  check('a verb that is not a lifecycle shorthand is not a script for npm: npm install', found('npm install').length === 0);
  check('the lifecycle shorthands run the script of the same name: npm stop', found('npm stop').join() === 'stop');
  check('the lifecycle shorthands run the script of the same name: npm restart', found('npm restart').join() === 'restart');
  check('a lifecycle shorthand that is not declared is not a chain: npm pack', found('npm pack').length === 0);
  check('pnpm and yarn take any bare word as the script', found('pnpm deploy').join() === 'deploy' && found('yarn deploy').join() === 'deploy');
  check('npm does not: npm deploy is no script run', found('npm deploy').length === 0);

  for (const verb of ['run', 'run-script', 'rum', 'urn']) check(`the verb "${verb}" runs a script by name`, found(`npm ${verb} deploy`).join() === 'deploy');
  for (const option of options) check(`the npm option ${option} is skipped with its value`, found(`npm ${option} run deploy`).join() === 'deploy', option);
  for (const option of ['--filter x', '-F x']) check(`the pnpm option ${option} is skipped with its value`, found(`pnpm ${option} run deploy`).join() === 'deploy', option);
  check('the yarn option --cwd is skipped with its value', found('yarn --cwd x run deploy').join() === 'deploy');

  check('an option with its value fused (--prefix=x) is one word', found('npm --prefix=x run deploy').join() === 'deploy');
  check('an option after the script belongs to the script', found('npm run deploy --silent').join() === 'deploy');
  check('the projects that declare a chain are ALL named', fullChainInvocations('npm run deploy', 'bash', custom)[0].projects.join() === 'p,q');
  check('a declared command names its single project', fullChainInvocations('node a/tools/big.mjs', 'bash', custom)[0].projects.join() === 'q');
  check('several chains in one line are all found, in execution order', found('npm test && npm start; node tools/big.mjs').join() === 'test,start,tools/big.mjs');
  check('the first of several is the one the answer names', decide(asMain('Bash', 'npm run ci:test && npm run build:ci-pr'))?.hookSpecificOutput.permissionDecisionReason.includes('npm run ci:test is a full chain'));
}

// ── The answer ──────────────────────────────────────────────────────────────────────────────────────────────
{
  const reason = decide(asMain('Bash', 'cd Discovery-FE && npm run build:ci-pr 2>&1 | tail -3'))?.hookSpecificOutput;
  const text = reason?.permissionDecisionReason ?? '';
  const english = text.split(' @es ')[0] ?? '';
  const wrapped = `node "${RUNNER}" --chain build:ci-pr`;
  const unique = decide(asMain('Bash', 'npm run check:mutation'))?.hookSpecificOutput.permissionDecisionReason ?? '';

  check('the answer is a PreToolUse deny', reason?.hookEventName === 'PreToolUse' && reason.permissionDecision === 'deny');
  check('the answer is bilingual, English first, Spanish with its accents', english.includes('FULL-CHAIN GUARD REFUSED') && text.includes('@es FULL-CHAIN GUARD RECHAZÓ') && text.includes('ahogaron la máquina'), text.slice(0, 200));
  check('it names the offending command, the chain and every project that declares it', english.includes('npm run build:ci-pr 2>&1 is a full chain (build:ci-pr, project b100-am-ui / di_1700002_discovery_fe)'), english.slice(0, 200));
  check('it names the exact runner command, with the session and the original command after --', text.includes(`${wrapped} --session sess-main -- npm run build:ci-pr 2>&1`), text);
  check('a chain declared by several projects gets no guessed --project: the runner records the directory', !text.includes('--project'), text);
  check('a chain declared by ONE project names it in the command', unique.includes(`node "${RUNNER}" --chain check:mutation --project b100-am-ui --session sess-main -- npm run check:mutation`), unique);
  check('it names the memory incident as the reason', english.includes('2026-10-05') && english.includes('low memory'));
  check('it states the bounded wait', english.includes('--wait-seconds') && english.includes('3600'));
  check('the runner it names exists', existsSync(RUNNER));

  for (const [tool, command] of [['Bash', 'npm run build:ci-pr'], ['PowerShell', 'npm run ci:test'], ['Bash', 'node selftest-runner/run.mjs --root x']]) {
    const offender = fullChainInvocations(command, tool === 'Bash' ? 'bash' : 'powershell', chains)[0];
    const suggested = wrappedCommand(offender, 'sess-1');

    check(`the suggested command passes the guard itself (round trip): ${command}`, verdictOf(asMain(tool, suggested)) === undefined, suggested);
  }

  check('with no session the flag is left out rather than invented', !wrappedCommand({ chain: 'c', projects: ['p'], text: 't' }, undefined).includes('--session'));
}

// ── Failing open ────────────────────────────────────────────────────────────────────────────────────────────
{
  const payload = JSON.stringify(asMain('Bash', 'npm run build:ci-pr'));

  check('malformed JSON passes', evaluate('not json') === undefined);
  check('an empty payload passes', evaluate('') === undefined);
  check('a BOM-prefixed payload is still decided', evaluate(`\uFEFF${payload}`)?.hookSpecificOutput?.permissionDecision === 'deny');
  check('a non-shell tool passes', evaluate(JSON.stringify({ tool_name: 'Read', tool_input: { command: 'npm run build:ci-pr' } })) === undefined);
  check('a payload with no command passes', evaluate(JSON.stringify({ tool_name: 'Bash', tool_input: {} })) === undefined);
  check('a command that is not text passes', evaluate(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 5 } })) === undefined);
  check('an unreadable declaration fails open', evaluate(payload, { chainsOf: () => { throw new Error('unreadable'); } }) === undefined);
  check('a decision that throws fails open', evaluate(payload, { decision: () => { throw new Error('boom'); } }) === undefined);
  check('a payload with no session still refuses, without a session flag', !evaluate(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm run build:ci-pr' } }))?.hookSpecificOutput?.permissionDecisionReason.includes('--session'));
}

// ── The guard as a process ──────────────────────────────────────────────────────────────────────────────────
{
  const run = (payload) => spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true });
  const refused = run(asMain('Bash', 'npm run build:ci-pr'));
  const allowed = run(asMain('Bash', 'npm test -- foo.spec'));

  check('as a process, a full chain prints one deny line and exits 0', refused.status === 0 && JSON.parse(refused.stdout).hookSpecificOutput.permissionDecision === 'deny', refused.stdout);
  check('as a process, a non-chain prints nothing and exits 0', allowed.status === 0 && allowed.stdout === '', allowed.stdout);
}

// ── The registered hook ─────────────────────────────────────────────────────────────────────────────────────
{
  const manifestFile = path.join(ROOT, 'hook-dispatch', 'manifests', 'pretooluse-shell.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const registration = JSON.parse(readFileSync(`${GUARD}.hook-registration.json`, 'utf8'));
  const settings = readFileSync(path.join(ROOT, 'settings.json'), 'utf8');
  const through = (payload) => spawnSync(process.execPath, [path.join(ROOT, 'hook-dispatch', 'dispatch.mjs'), manifestFile], { input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true });

  check('the PreToolUse shell manifest lists the guard', manifest.guards.includes('../../full-chain-lock/guard.mjs'));
  check('the registration says PreToolUse on Bash and PowerShell', registration.registrations.some((entry) => entry.event === 'PreToolUse' && entry.matcher === 'Bash|PowerShell'));
  check('the registration states why', typeof registration.why === 'string' && registration.why.includes('2026-10-05'));
  check('settings.json runs the dispatcher with that manifest on the shell tools', settings.includes('hook-dispatch/manifests/pretooluse-shell.json'));

  const refused = through(asMain('Bash', 'npm run build:ci-pr'));
  const decision = refused.stdout.trim() === '' ? undefined : JSON.parse(refused.stdout.trim().split('\n').at(-1));
  const allowed = through(asMain('Bash', 'npm test -- foo.spec'));

  check('a real-shaped Bash payload through the dispatcher is refused by this guard', decision?.hookSpecificOutput?.permissionDecision === 'deny' && decision.hookSpecificOutput.permissionDecisionReason.includes('FULL-CHAIN GUARD REFUSED'), refused.stdout.slice(0, 300) + refused.stderr.slice(0, 300));
  check('a real-shaped PowerShell payload through the dispatcher is refused too', JSON.stringify(JSON.parse(through(asMain('PowerShell', 'npm run ci:test')).stdout.trim().split('\n').at(-1))).includes('FULL-CHAIN GUARD REFUSED'));
  check('a non-chain through the dispatcher is not refused by this guard', !allowed.stdout.includes('FULL-CHAIN GUARD REFUSED'), allowed.stdout.slice(0, 300));
}

process.stdout.write(`\n${String(passed)} passed, ${String(failed)} failed\n`);
process.exit(failed === 0 ? 0 : 1);
