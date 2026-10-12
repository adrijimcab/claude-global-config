#!/usr/bin/env node
/**
 * Self-test for the integration-branch drift warning (`UserPromptSubmit`). Repositories are CONSTRUCTED (see
 * `fixtures.mjs`). The warning is driven two ways: `evaluate()` over raw payloads, and the script run as a
 * process with the payload on stdin (the registration in `settings.json` is proved by `wiring.selftest.mjs`).
 *
 * THE STATE SPACE: a clone in sync (silent); drifted with the remote-tracking ref (warns, names the sync
 * command); drifted without it (warns, names the owner's decision); a linked worktree of a drifted clone; a
 * repository declaring nothing; an unreadable declaration; a directory outside any repository; a subagent
 * caller; malformed input; a payload with no cwd. It never blocks, and it warns on every prompt while the
 * drift lasts (no state to lose).
 *
 * @es Auto-test del aviso de deriva de la rama de integración (`UserPromptSubmit`). Los repositorios se
 * CONSTRUYEN. El aviso se ejecuta de dos maneras: `evaluate()` sobre payloads crudos y el script como proceso
 * con el payload por stdin (el registro en `settings.json` lo prueba `wiring.selftest.mjs`). Nunca bloquea, y avisa en cada prompt
 * mientras dure la deriva (no hay estado que perder).
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { isolateState } from '../hook-state/locations.mjs';
import { git, makeWorld, put } from './fixtures.mjs';

isolateState('integration-branch');

const { evaluate } = await import('./prompt-hook.mjs');

const world = makeWorld();
let passed = 0;
const failures = [];

function check(condition, name) {
  if (condition) passed += 1;
  else failures.push(name);
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
}

const payloadFor = (cwd, extra = {}) => ({ session_id: 'b6959f54-7808-45ca-bb88-cf53c0ecf9cf', transcript_path: path.join(world.root, 't.jsonl'), cwd, prompt_id: 'f9f7bdd3-c568-46b8-a6d0-acb19dc2cf5a', permission_mode: 'auto', hook_event_name: 'UserPromptSubmit', prompt: 'say hi', ...extra });
const ask = (cwd, extra) => evaluate(JSON.stringify(payloadFor(cwd, extra)));
const noticeOf = (output) => output?.hookSpecificOutput?.additionalContext ?? '';
const SYNC = path.join(import.meta.dirname, 'sync.mjs');

// ── evaluate() ───────────────────────────────────────────────────────────────────────────────────
const drifted = world.repository(['feature/meet', 'develop']);
const warned = ask(drifted.clone);
const text = noticeOf(warned);
const [english, spanish] = text.split(' @es ');
check(warned?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit', 'a drifted clone gets a UserPromptSubmit notice');
const names = (half) => half !== undefined && half.includes(drifted.clone) && half.includes('feature/meet') && half.includes(' main;') && half.includes(path.join(drifted.clone, '.claude/fleet-kit.json')) && half.includes(`node "${SYNC}" "${drifted.clone}"`);
check(names(english) === true, `the English half names the clone, the declared branch, where origin/HEAD points, the source and the exact sync command: ${english}`);
check(spanish?.includes(drifted.clone) && spanish.includes('apunta a main') && spanish.includes(`node "${SYNC}" "${drifted.clone}"`) && spanish.startsWith('DERIVA'), `the Spanish half says the same: ${spanish}`);
check(warned && !('decision' in warned) && !('decision' in (warned.hookSpecificOutput ?? {})), 'the notice never blocks');
check(noticeOf(ask(drifted.clone)) === text, 'the warning repeats on every prompt while the drift lasts');

const synced = world.repository(['main']);
check(ask(synced.clone) === undefined, 'a clone in sync is silent');
git(drifted.clone, 'remote', 'set-head', 'origin', 'feature/meet');
check(ask(drifted.clone) === undefined, 'after the sync command the warning stops');

const driftedAgain = world.repository(['develop']);
const linked = path.join(driftedAgain.home, 'linked');
git(driftedAgain.clone, 'worktree', 'add', '-q', '-b', 'work', linked);
const viaWorktree = noticeOf(ask(linked));
check(viaWorktree.includes(driftedAgain.clone) && viaWorktree.includes(`"${driftedAgain.clone}"`), 'a session in a linked worktree is warned about the main checkout and told to sync it');

const unset = world.repository(['develop']);
git(unset.clone, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
check(noticeOf(ask(unset.clone)).includes('(unset @es sin fijar)'), 'a clone whose origin/HEAD is unset is warned and the notice says it is unset');

const unpublished = world.repository(['unpublished']);
git(unpublished.clone, 'branch', 'unpublished');
const missing = noticeOf(ask(unpublished.clone));
const [missingEnglish, missingSpanish] = missing.split(' @es ');
check(missingEnglish.includes('refs/remotes/origin/unpublished') && missingEnglish.includes('fetch or the push') && missingSpanish?.includes('fetch o el push'), `a drift whose declared branch has no remote-tracking ref says the owner decides the fetch or the push: ${missing}`);

check(ask(world.repository(undefined).clone) === undefined, 'a repository declaring nothing is silent');
const broken = world.repository(undefined);
put(broken.clone, '.claude/fleet-kit.json', '{ not json');
check(ask(broken.clone) === undefined, 'an unreadable declaration is silent (the landing refuses it; the prompt never fails)');
check(ask(world.directory('x.txt', 'x')) === undefined, 'a directory outside any repository is silent');
const other = world.repository(['feature/meet']);
check(ask(other.clone, { agent_id: 'a1b2c3' }) === undefined, 'a subagent caller is not warned');
check(ask(other.clone, { transcript_path: path.join(world.root, 'p', 's', 'subagents', 'agent-1.jsonl') }) === undefined, 'a subagent transcript is not warned');
check(evaluate('not json') === undefined && evaluate('') === undefined && evaluate('null') === undefined, 'malformed input is silent');
check(evaluate(JSON.stringify({ prompt: 'hi' })) === undefined, 'a payload without cwd is silent');
check(evaluate(`\uFEFF${JSON.stringify(payloadFor(other.clone))}`)?.hookSpecificOutput !== undefined, 'a byte-order mark before the payload is tolerated');

// ── The script run as a process, payload on stdin ────────────────────────────────────────────────
const HOOK = path.join(import.meta.dirname, 'prompt-hook.mjs');
const runHook = (payload) => spawnSync(process.execPath, [HOOK], { input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });
const driftedCli = world.repository(['feature/meet']);
const cliWarn = runHook(payloadFor(driftedCli.clone));
const cliOutput = JSON.parse(cliWarn.stdout || '{}');
check(cliWarn.status === 0 && cliOutput.hookSpecificOutput?.hookEventName === 'UserPromptSubmit' && cliOutput.hookSpecificOutput.additionalContext.includes('feature/meet'), `the script exits 0 and prints the notice (exit ${cliWarn.status})`);
const cliQuiet = runHook(payloadFor(synced.clone));
check(cliQuiet.status === 0 && cliQuiet.stdout === '', 'the script is silent for a clone in sync');
const cliBroken = runHook('not json');
check(cliBroken.status === 0 && cliBroken.stdout === '', 'the script exits 0 and prints nothing for malformed input');

world.dispose();
const total = passed + failures.length;
console.log(`${passed}/${total} assertions passed @es ${passed}/${total} aserciones correctas`);
if (failures.length > 0) console.log(`FAILED: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
