#!/usr/bin/env node
/**
 * Proof of the review stop hook (`stop-hook.mjs`): gentle-ai's own `review stop-hook` runs ONLY where a review can
 * happen, a linked worktree, and is silent in a repository's main checkout.
 *
 * THE STATE SPACE, every state a REAL repository in a git sandbox, the hook run as the harness runs it (a payload on
 * stdin, a process, a stdout, an exit code) and gentle-ai replaced by an injected stand-in that records how it was
 * called (the real gentle-ai is never run):
 *   where        a main checkout / a linked worktree / a directory nested in each / a directory that is no repository
 *   event        Stop and SessionStart (gentle-ai keeps a baseline per session: both events follow the same rule)
 *   payload      real-shaped, multibyte, with a byte-order mark / not JSON / empty / with no cwd
 *   gentle-ai    answers and exits 0 / prints on stdout and stderr and exits non-zero / is not installed
 *   the record   what the hook journaled about each decision
 * and the wiring: settings.json runs this hook, and only this hook, for both events.
 *
 * @es Prueba del hook de parada de revisión: el `review stop-hook` de gentle-ai corre SOLO donde una revisión puede
 * ocurrir, un worktree enlazado, y calla en el checkout principal de un repositorio. Cada estado es un repositorio
 * REAL en un sandbox de git, el hook se corre como lo corre el harness (payload por stdin, un proceso, una salida,
 * un código de salida) y gentle-ai se sustituye por un doble inyectado que registra cómo lo llamaron (el gentle-ai
 * real nunca corre): dónde, qué evento, qué payload, cómo responde gentle-ai, qué registró el hook, y el cableado.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isolateState, stateDir } from '../hook-state/locations.mjs';
import { importClosure } from '../mutation-proof/import-closure.mjs';
import { createGitSandbox } from '../selftest-fixtures/git-sandbox.mjs';

isolateState('review-site');
const HERE = import.meta.dirname;
const HOOK = path.join(HERE, 'stop-hook.mjs');

const results = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const sandbox = createGitSandbox();
process.once('exit', () => sandbox.cleanup());

/** Runs git in the sandbox and throws on failure. @es Corre git en el sandbox y lanza si falla. */
function git(args, cwd = sandbox.repoDir) {
  const result = sandbox.git(args, { cwd });

  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

writeFileSync(path.join(sandbox.repoDir, 'base.txt'), 'base');
git(['add', 'base.txt']);
git(['commit', '-q', '-m', 'base']);

const main = sandbox.repoDir;
const linked = path.join(sandbox.root, 'linked');
git(['worktree', 'add', '-q', '-b', 'unit', linked]);
const nestedMain = path.join(main, 'src', 'deep');
const nestedLinked = path.join(linked, 'src', 'deep');
mkdirSync(nestedMain, { recursive: true });
mkdirSync(nestedLinked, { recursive: true });
const plain = sandbox.plainDir('plain');

/**
 * The stand-in for gentle-ai: records its arguments and the exact bytes of its stdin in `calls.jsonl`, prints what
 * `behaviour.json` says, and exits with the code it says. @es El doble de gentle-ai.
 */
const STAND_IN = `
const fs = require('node:fs');
const path = require('node:path');
const input = fs.readFileSync(0);
fs.appendFileSync(path.join(__dirname, 'calls.jsonl'), JSON.stringify({ argv: process.argv.slice(2), stdin: input.toString('base64') }) + '\\n');
const behaviour = JSON.parse(fs.readFileSync(path.join(__dirname, 'behaviour.json'), 'utf8'));
process.stdout.write(behaviour.stdout);
process.stderr.write(behaviour.stderr);
process.exit(behaviour.exit);
`;

const standInDir = path.join(sandbox.root, 'stand-in');
mkdirSync(standInDir);
writeFileSync(path.join(standInDir, 'gentle-ai.cjs'), STAND_IN);
const calls = path.join(standInDir, 'calls.jsonl');
const behave = (behaviour) => writeFileSync(path.join(standInDir, 'behaviour.json'), JSON.stringify({ stdout: '', stderr: '', exit: 0, ...behaviour }));
const STAND_IN_LAUNCH = JSON.stringify([process.execPath, path.join(standInDir, 'gentle-ai.cjs')]);
const MISSING_LAUNCH = JSON.stringify([path.join(sandbox.root, 'no-such-gentle-ai')]);

const callsMade = () => (existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
const resetCalls = () => writeFileSync(calls, '');
const journal = () => {
  const file = path.join(stateDir('review-site'), 'journal.jsonl');

  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
};
const resetJournal = () => writeFileSync(path.join(stateDir('review-site'), 'journal.jsonl'), '');
mkdirSync(stateDir('review-site'), { recursive: true });

/** A payload shaped as the harness sends it. CONSTRUCTED from the documented hook input, not captured. @es Un payload con la forma documentada. */
const payload = (cwd, event = 'Stop', extra = {}) => ({
  session_id: 'session-1',
  transcript_path: path.join(sandbox.root, 'transcript.jsonl'),
  ...(cwd === undefined ? {} : { cwd }),
  hook_event_name: event,
  ...(event === 'Stop' ? { stop_hook_active: false, last_assistant_message: 'Listo — ñandú 日本 ✓' } : { source: 'startup' }),
  ...extra
});

/** Runs the hook as the harness does: stdin bytes in, a process out. @es Corre el hook como el harness. */
function runHook(input, { launch = STAND_IN_LAUNCH, cwd = main, hook = HOOK } = {}) {
  resetCalls();
  resetJournal();

  const result = spawnSync(process.execPath, [hook], { input, cwd, encoding: 'buffer', windowsHide: true, env: { ...process.env, REVIEW_SITE_GENTLE_AI_LAUNCH: launch } });

  return { status: result.status, stdout: result.stdout.toString('utf8'), stderr: result.stderr.toString('utf8') };
}

const asBytes = (value) => Buffer.from(JSON.stringify(value), 'utf8');

behave({});

// ---- where: a main checkout is silent, gentle-ai is not called. @es Un checkout principal calla y no se llama a gentle-ai.
for (const [label, directory] of [['a main checkout', main], ['a directory nested in a main checkout', nestedMain]]) {
  for (const event of ['Stop', 'SessionStart']) {
    const run = runHook(asBytes(payload(directory, event)));

    check(`${event} in ${label}: silent, exit 0`, [run.status, run.stdout, run.stderr], [0, '', '']);
    check(`${event} in ${label}: gentle-ai is not called`, callsMade().length, 0);
    check(`${event} in ${label}: the decision is journaled`, journal().map((entry) => [entry.decision, entry.reason, entry.event, entry.session, entry.cwd]), [['skipped', 'main-checkout', event, 'session-1', directory]]);
  }
}

// ---- where: a linked worktree runs gentle-ai with the payload UNCHANGED. @es Un worktree enlazado corre gentle-ai con el payload SIN CAMBIOS.
behave({ stdout: 'REMINDER ñ\n', exit: 0 });
for (const [label, directory] of [['a linked worktree', linked], ['a directory nested in a linked worktree', nestedLinked]]) {
  for (const event of ['Stop', 'SessionStart']) {
    const bytes = asBytes(payload(directory, event));
    const run = runHook(bytes);
    const [call] = callsMade();

    check(`${event} in ${label}: gentle-ai output reaches the harness, exit 0`, [run.status, run.stdout, run.stderr], [0, 'REMINDER ñ\n', '']);
    check(`${event} in ${label}: gentle-ai is called once with its original arguments`, [callsMade().length, call?.argv], [1, ['review', 'stop-hook', '--agent', 'claude-code']]);
    check(`${event} in ${label}: gentle-ai receives the payload byte for byte`, call === undefined ? undefined : Buffer.from(call.stdin, 'base64').equals(bytes), true);
    check(`${event} in ${label}: the decision is journaled`, journal().map((entry) => [entry.decision, entry.reason, entry.event, entry.cwd]), [['ran', 'linked-worktree', event, directory]]);
  }
}

const withMark = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), asBytes(payload(main))]);
const marked = runHook(withMark);
check('a payload with a byte-order mark is read as the harness meant it: main checkout, silent', [marked.status, marked.stdout, callsMade().length], [0, '', 0]);

// ---- gentle-ai answers badly: its exit code and its output pass through. @es Si gentle-ai responde mal, su código y su salida pasan.
behave({ stdout: 'partial out', stderr: 'it failed ñ', exit: 3 });
const failing = runHook(asBytes(payload(linked)));
check('gentle-ai exits non-zero: the hook exits with the same code', failing.status, 3);
check('gentle-ai exits non-zero: its stdout and stderr pass through', [failing.stdout, failing.stderr], ['partial out', 'it failed ñ']);

behave({ stdout: '{"decision":"block","reason":"review"}', exit: 2 });
const blocking = runHook(asBytes(payload(linked)));
check('gentle-ai exits 2 (a blocking Stop): the hook exits 2 with its output', [blocking.status, blocking.stdout], [2, '{"decision":"block","reason":"review"}']);

behave({});
const absent = runHook(asBytes(payload(linked)), { launch: MISSING_LAUNCH });
check('gentle-ai is not installed: exit 127, nothing on stdout', [absent.status, absent.stdout], [127, '']);
check('gentle-ai is not installed: the failure is named in both languages', /could not run/.test(absent.stderr) && /@es .*no pudo ejecutarse/.test(absent.stderr), true);
check('gentle-ai is not installed: the decision was still journaled', journal().map((entry) => entry.decision), ['ran']);

const absentInMain = runHook(asBytes(payload(main)), { launch: MISSING_LAUNCH });
check('gentle-ai is not installed but the cwd is a main checkout: still silent, exit 0', [absentInMain.status, absentInMain.stdout, absentInMain.stderr], [0, '', '']);

// ---- the hook's own errors: the ORIGINAL hook runs, a review is never silently dropped. @es Ante un error propio corre el hook ORIGINAL.
behave({ stdout: 'ran anyway' });
for (const [label, input, reason] of [
  ['a payload that is not JSON', Buffer.from('not json at all'), 'unreadable-payload'],
  ['an empty payload', Buffer.alloc(0), 'unreadable-payload'],
  ['a payload that is not an object', Buffer.from('[1,2]'), 'unreadable-payload'],
  ['a payload that is JSON null', Buffer.from('null'), 'unreadable-payload'],
  ['a cwd that is empty', asBytes(payload('')), 'unreadable-payload'],
  ['a cwd that is no repository', asBytes(payload(plain)), 'fail-open'],
  ['a cwd that does not exist', asBytes(payload(path.join(sandbox.root, 'missing'))), 'fail-open'],
  ['a cwd that is not a string', asBytes(payload(undefined, 'Stop', { cwd: 7 })), 'unreadable-payload']
]) {
  const run = runHook(input);
  const [call] = callsMade();

  check(`${label}: the original hook runs and its output passes through`, [run.status, run.stdout, callsMade().length], [0, 'ran anyway', 1]);
  check(`${label}: it received the same bytes`, call === undefined ? undefined : Buffer.from(call.stdin, 'base64').equals(input), true);
  check(`${label}: the fail-open is journaled with its reason`, journal().map((entry) => [entry.decision, entry.reason]), [['fail-open', reason]]);
}

const noCwdFromLinked = runHook(asBytes(payload(undefined)), { cwd: linked });
check('a payload with no cwd falls back to the process directory: a linked worktree runs gentle-ai', [noCwdFromLinked.status, callsMade().length, journal().map((entry) => entry.reason)], [0, 1, ['linked-worktree']]);
const noCwdFromMain = runHook(asBytes(payload(undefined)), { cwd: main });
check('a payload with no cwd falls back to the process directory: a main checkout stays silent', [noCwdFromMain.status, callsMade().length], [0, 0]);

// ---- the wiring: settings.json runs this hook and only this hook for both events. @es El cableado.
const settings = JSON.parse(readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8'));
const commandsOf = (event) => (settings.hooks?.[event] ?? []).flatMap((group) => group.hooks ?? []).map((hook) => hook.command);
const WIRED = 'node "$HOME/.claude/review-site/stop-hook.mjs"';
for (const event of ['Stop', 'SessionStart']) {
  check(`settings: ${event} runs the review-site stop hook exactly once`, commandsOf(event).filter((command) => command === WIRED).length, 1);
  check(`settings: ${event} no longer runs gentle-ai's stop hook directly`, commandsOf(event).filter((command) => command.includes('gentle-ai review stop-hook')).length, 0);
}

// ---- a sibling module that cannot load: the original hook still runs. @es Un módulo hermano que no carga: el hook original corre igual.
/**
 * The top-level folders the copied mechanism needs, derived from the import closure of its three modules, never a
 * hand list, which goes stale the moment a module it reaches gains an import (git-worktree reaching git-port did).
 * The two dynamically imported modules are entries of their own. A closure that cannot be followed stops the run.
 * @es Las carpetas de primer nivel que necesita el mecanismo copiado, derivadas del cierre de imports de sus tres
 * módulos y nunca de una lista a mano, que caduca en cuanto un módulo que alcanza gana un import (como pasó cuando
 * git-worktree empezó a usar git-port). Los dos módulos importados dinámicamente son entradas propias. Un cierre que
 * no se puede seguir detiene la corrida.
 */
const MECHANISM_FOLDERS = (() => {
  const closure = importClosure({ root: path.join(HERE, '..'), entries: ['review-site/stop-hook.mjs', 'review-site/decide.mjs', 'review-site/journal.mjs'] });

  if (closure.problems.length > 0) throw new Error(`the import closure of the review-site hook cannot be followed: ${closure.problems.join('; ')} @es el cierre de imports del hook de review-site no se puede seguir`);

  return [...new Set(closure.files.map((file) => file.split('/')[0]))];
})();

/** A copy of the mechanism whose `broken` file throws when it loads; returns the copy's hook path. @es Una copia del mecanismo cuyo fichero `broken` lanza al cargar. */
function copyWithBroken(name, broken) {
  const root = path.join(sandbox.root, name);

  for (const directory of MECHANISM_FOLDERS) cpSync(path.join(HERE, '..', directory), path.join(root, directory), { recursive: true });

  writeFileSync(path.join(root, 'review-site', broken), "throw new Error('broken on purpose');\n");

  return path.join(root, 'review-site', 'stop-hook.mjs');
}

behave({ stdout: 'ran anyway', exit: 0 });
const brokenDecision = copyWithBroken('broken-decision', 'decide.mjs');
for (const [label, directory] of [['a main checkout', main], ['a linked worktree', linked]]) {
  const bytes = asBytes(payload(directory));
  const run = runHook(bytes, { hook: brokenDecision });
  const [call] = callsMade();

  check(`the decision module cannot load, cwd in ${label}: the original hook runs and its output passes through`, [run.status, run.stdout, callsMade().length], [0, 'ran anyway', 1]);
  check(`the decision module cannot load, cwd in ${label}: it received the payload byte for byte`, call === undefined ? undefined : Buffer.from(call.stdin, 'base64').equals(bytes), true);
  check(`the decision module cannot load, cwd in ${label}: the fail-open is journaled`, journal().map((entry) => [entry.decision, entry.reason]), [['fail-open', 'fail-open']]);
}

const brokenJournal = copyWithBroken('broken-journal', 'journal.mjs');
const skippedWithoutJournal = runHook(asBytes(payload(main)), { hook: brokenJournal });
check('the journal cannot load, cwd in a main checkout: still silent, exit 0, gentle-ai not called', [skippedWithoutJournal.status, skippedWithoutJournal.stdout, callsMade().length], [0, '', 0]);
const ranWithoutJournal = runHook(asBytes(payload(linked)), { hook: brokenJournal });
check('the journal cannot load, cwd in a linked worktree: gentle-ai runs and its output passes through', [ranWithoutJournal.status, ranWithoutJournal.stdout, callsMade().length], [0, 'ran anyway', 1]);

// ---- the exit code for every way a gentle-ai run can end. @es El código de salida de cada forma en que termina gentle-ai.
const { exitCodeFor } = await import(pathToFileURL(HOOK).href);
check('exit code: gentle-ai exits 0', exitCodeFor({ status: 0 }), 0);
check('exit code: gentle-ai exits 2', exitCodeFor({ status: 2 }), 2);
check('exit code: gentle-ai ended by a signal has no status: 1', exitCodeFor({ status: null, signal: 'SIGTERM' }), 1);
check('exit code: gentle-ai could not start: 127', exitCodeFor({ error: new Error('ENOENT'), status: null }), 127);

const passed = results.filter(Boolean).length;

console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
