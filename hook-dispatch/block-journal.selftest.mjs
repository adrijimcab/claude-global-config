#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-dispatch/block-journal.mjs` and its wiring in `dispatch.mjs`: the dispatcher
 * is the one place that sees every guard's output, so it journals ONE `decision` record per guard output that
 * blocks, and the false-block rate has something to measure. The decision is read from the output of each
 * guard BEFORE the merge (afterwards the guard is no longer known), and the real dispatcher process is run on
 * guards built by this test in a temp directory, with `HOOK_STATE_DIR` redirected: no live journal is touched.
 *
 * THE STATE SPACE: an output that blocks by `permissionDecision: deny` / by `decision: block` / by
 * `continue: false`, by several of them at once, with a reason / without one / with a reason of the wrong type
 * / longer than the limit / exactly at it; outputs that do NOT block (`ask`, `allow`, context only, a system
 * message only, `decision: approve`, `continue: true`, nothing, a non-object); a payload with and without a
 * tool use id, with and without a tool input, with a BOM, torn or not JSON; two guards that block, in two
 * folders and in the same one; a guard that blocks next to one that is broken; a journal that cannot be
 * written (the hook output must stay byte for byte the same, the failure is reported); the privacy of the
 * record (the command text is never written, only its digest); and a dismissal that must join its decision.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `block-journal.mjs` y de su cableado en `dispatch.mjs`: el dispatcher es el
 * único lugar que ve la salida de cada guardia, así que registra UN `decision` por cada salida de guardia que
 * bloquea, y la tasa de falsos bloqueos tiene algo que medir. La decisión se lee de la salida de cada guardia
 * ANTES de fusionar (después ya no se sabe de quién es), y el proceso real del dispatcher corre sobre
 * guardias construidas por este test en un directorio temporal, con `HOOK_STATE_DIR` redirigido: ningún
 * journal vivo se toca. Espacio de estados: una salida que bloquea por `permissionDecision: deny` / por
 * `decision: block` / por `continue: false`, por varios a la vez, con motivo / sin él / con un motivo de tipo
 * erróneo / más largo que el límite / justo en él; salidas que NO bloquean (`ask`, `allow`, solo contexto,
 * solo mensaje, `decision: approve`, `continue: true`, nada, un no-objeto); un payload con y sin id de uso de
 * herramienta, con y sin entrada, con BOM, cortado o no JSON; dos guardias que bloquean, en dos carpetas y
 * en la misma; una guardia que bloquea junto a una rota; un journal que no se puede escribir (la salida del
 * hook debe quedar idéntica byte a byte y el fallo se informa); la privacidad del registro (nunca el texto
 * del comando, solo su huella); y un descarte que debe unirse a su decisión.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyBlocks, readMechanism } from '../guard-precision/blocks.mjs';
import { digestInput } from '../hook-state/journal.mjs';
import { recordOutcome } from '../hook-state/dismiss.mjs';
import { stateDir } from '../hook-state/locations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const failures = [];

/** A run that exits before its summary is reported as a failed check. @es Una corrida que sale antes del resumen se informa como check fallido. */
let summarised = false;
process.on('exit', () => {
  if (summarised) return;

  writeSync(1, 'FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen\n');
  process.exitCode = 1;
});

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const saved = { HOOK_STATE_DIR: process.env.HOOK_STATE_DIR, HOOK_CLAUDE_HOME: process.env.HOOK_CLAUDE_HOME };
const root = mkdtempSync(path.join(os.tmpdir(), 'block-journal-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(root, { recursive: true, force: true }));
const stateRoot = path.join(root, 'state');
process.env.HOOK_STATE_DIR = stateRoot;
process.env.HOOK_CLAUDE_HOME = path.join(root, 'claude');

let loaded;

try {
  loaded = await import('./block-journal.mjs');
} catch (error) {
  failures.push(`the module does not load — ${error.message}`);
}

const safe = (action) => {
  try {
    return action();
  } catch (error) {
    return { threw: error.message };
  }
};
const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};
const linesOfJournal = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line !== '').map((line) => json(line)) : []);
const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', ...(reason === undefined ? {} : { permissionDecisionReason: reason }) } });

if (loaded !== undefined) {
  const { REASON_LIMIT, blockOf, describeBlocks, recordBlocks } = loaded;

  // --- blockOf: which outputs block, and the reason they give ---
  const blockIn = (output) => safe(() => blockOf(output));
  check('a deny blocks and gives its permission reason', blockIn(deny('R')), { reason: 'R' });
  check('a deny without a reason blocks without one', blockIn(deny()), { reason: undefined });
  check('a Stop block blocks and gives its reason', blockIn({ decision: 'block', reason: 'B' }), { reason: 'B' });
  check('a block without a reason blocks without one', blockIn({ decision: 'block' }), { reason: undefined });
  check('continue false blocks and gives its stop reason', blockIn({ continue: false, stopReason: 'S' }), { reason: 'S' });
  check('continue false without a stop reason blocks without one', blockIn({ continue: false }), { reason: undefined });
  check('a deny and a block at once give the permission reason first', blockIn({ ...deny('R'), decision: 'block', reason: 'B', continue: false, stopReason: 'S' }), { reason: 'R' });
  check('a block and a stop at once give the block reason first', blockIn({ decision: 'block', reason: 'B', continue: false, stopReason: 'S' }), { reason: 'B' });
  check('a deny without a reason falls to the block reason', blockIn({ ...deny(), decision: 'block', reason: 'B' }), { reason: 'B' });
  check('a reason that is empty is no reason', blockIn(deny('')), { reason: undefined });
  check('a reason that is not a string is no reason', blockIn({ decision: 'block', reason: 7 }), { reason: undefined });
  check('the reason of a deny is not read from an ask', blockIn({ hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'Q' } }), undefined);
  check('an allow does not block', blockIn({ hookSpecificOutput: { permissionDecision: 'allow', permissionDecisionReason: 'A' } }), undefined);
  check('context alone does not block', blockIn({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'c' } }), undefined);
  check('a system message alone does not block', blockIn({ systemMessage: 'm' }), undefined);
  check('decision approve does not block', blockIn({ decision: 'approve', reason: 'x' }), undefined);
  check('continue true does not block', blockIn({ continue: true, stopReason: 'x' }), undefined);
  check('the reason of an ask is not the reason of a block that comes with it', blockIn({ decision: 'block', reason: 'B', hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'Q' } }), { reason: 'B' });
  check('the reason of an approve is not the reason of a stop that comes with it', blockIn({ continue: false, stopReason: 'S', decision: 'approve', reason: 'x' }), { reason: 'S' });
  check('the stop reason of a continue true is not the reason of a block that has none', blockIn({ decision: 'block', continue: true, stopReason: 'S' }), { reason: undefined });
  check('nothing but non-blocking reasons does not block', blockIn({ hookSpecificOutput: { permissionDecision: 'allow', permissionDecisionReason: 'A' }, decision: 'approve', reason: 'x', stopReason: 'y' }), undefined);
  check('nothing does not block', [blockIn(undefined), blockIn(null)], [undefined, undefined]);
  check('a non-object does not block', [blockIn('deny'), blockIn(7), blockIn(true)], [undefined, undefined, undefined]);
  check('a hookSpecificOutput that is not an object does not block', [blockIn({ hookSpecificOutput: 'deny' }), blockIn({ hookSpecificOutput: null })], [undefined, undefined]);

  // --- describeBlocks: one record per blocking guard output, with the payload facts ---
  const payload = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'rm -rf secrets' } };
  const raw = JSON.stringify(payload);
  const described = (results, rawText = raw, event = 'PreToolUse') => safe(() => describeBlocks({ event, raw: rawText, results }));
  const one = described([{ mechanism: 'm-a', output: deny('R') }]);
  check('a blocking output yields one block with the mechanism, event, tool use, digest and reason', one, [{ mechanism: 'm-a', event: 'PreToolUse', toolUseId: 'toolu_1', inputDigest: digestInput({ command: 'rm -rf secrets' }), reason: 'R' }]);
  check('the digest is of the tool input, never the command text', JSON.stringify(one).includes('rm -rf'), false);
  check('guards that do not block yield nothing', described([{ mechanism: 'm-a', output: undefined }, { mechanism: 'm-b', output: { systemMessage: 'x' } }]), []);
  check('two blocking guards yield two blocks in the order of the manifest', Array.from(described([{ mechanism: 'm-a', output: deny('A') }, { mechanism: 'm-b', output: undefined }, { mechanism: 'm-c', output: { decision: 'block', reason: 'C' } }]), (block) => [block.mechanism, block.reason]), [['m-a', 'A'], ['m-c', 'C']]);
  check('the event given is the event recorded', described([{ mechanism: 'm-a', output: { decision: 'block' } }], raw, 'Stop')[0]?.event, 'Stop');
  const withoutUse = described([{ mechanism: 'm-a', output: deny('R') }], JSON.stringify({ tool_input: { command: 'x' } }));
  check('a payload without a tool use id has a null one', withoutUse[0]?.toolUseId, null);
  check('a tool use id that is not a string is null', described([{ mechanism: 'm-a', output: deny('R') }], JSON.stringify({ tool_use_id: 7, tool_input: {} }))[0]?.toolUseId, null);
  const stopRaw = JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' });
  check('a payload without a tool input is digested whole', described([{ mechanism: 'm-a', output: { decision: 'block' } }], stopRaw, 'Stop')[0]?.inputDigest, digestInput(stopRaw));
  check('a payload with a null tool input is digested whole', described([{ mechanism: 'm-a', output: deny('R') }], JSON.stringify({ tool_input: null }))[0]?.inputDigest, digestInput(JSON.stringify({ tool_input: null })));
  check('a payload that is not JSON is digested whole and has no tool use', [described([{ mechanism: 'm-a', output: deny('R') }], 'not json')[0]?.inputDigest, described([{ mechanism: 'm-a', output: deny('R') }], 'not json')[0]?.toolUseId], [digestInput('not json'), null]);
  check('a payload that is a JSON null is digested whole', described([{ mechanism: 'm-a', output: deny('R') }], 'null')[0]?.inputDigest, digestInput('null'));
  check('a payload with a BOM is read', [described([{ mechanism: 'm-a', output: deny('R') }], `﻿${raw}`)[0]?.toolUseId, described([{ mechanism: 'm-a', output: deny('R') }], `﻿${raw}`)[0]?.inputDigest], ['toolu_1', digestInput({ command: 'rm -rf secrets' })]);
  const longReason = 'x'.repeat(REASON_LIMIT);
  check('a reason of exactly the limit is kept whole', described([{ mechanism: 'm-a', output: deny(longReason) }])[0]?.reason, longReason);
  const truncated = described([{ mechanism: 'm-a', output: deny(`${longReason}y`) }])[0]?.reason ?? '';
  check('a reason over the limit is cut to the limit and ends with an ellipsis', [truncated.length, truncated.endsWith('…'), truncated.slice(0, -1) === 'x'.repeat(REASON_LIMIT - 1)], [REASON_LIMIT, true, true]);
  check('the limit is 300 characters', REASON_LIMIT, 300);
  check('a block with no reason has no reason key value', described([{ mechanism: 'm-a', output: deny() }])[0]?.reason, undefined);

  // --- recordBlocks: one decision per block, a failure never throws ---
  const appended = [];
  const ids = ['id-1', 'id-2', 'id-3'];
  const blocks = [
    { mechanism: 'm-a', event: 'PreToolUse', toolUseId: 'toolu_1', inputDigest: 'd1', reason: 'R1' },
    { mechanism: 'm-b', event: 'Stop', toolUseId: null, inputDigest: 'd2', reason: undefined }
  ];
  const noFailures = safe(() => recordBlocks(blocks, { append: (mechanism, fields) => appended.push([mechanism, fields]), newBlockId: () => ids.shift() }));
  check('recording succeeds with no failure', noFailures, []);
  check('each block is appended once to its own mechanism as a decision with a fresh block id', appended, [
    ['m-a', { kind: 'decision', blockId: 'id-1', event: 'PreToolUse', toolUseId: 'toolu_1', inputDigest: 'd1', reason: 'R1' }],
    ['m-b', { kind: 'decision', blockId: 'id-2', event: 'Stop', toolUseId: null, inputDigest: 'd2', reason: undefined }]
  ]);
  check('no block records nothing and fails nothing', safe(() => recordBlocks([], { append: () => { throw new Error('never'); } })), []);
  const calls = [];
  const failed = safe(() => recordBlocks(blocks, { append: (mechanism) => { calls.push(mechanism); throw new Error(`disk full ${mechanism}`); }, newBlockId: () => 'x' }));
  check('a write that fails is reported with its mechanism, the next block is still tried', [failed, calls], [['m-a: disk full m-a', 'm-b: disk full m-b'], ['m-a', 'm-b']]);
  check('a write that fails with something that is not an Error is reported as its text', safe(() => recordBlocks(blocks.slice(0, 1), { append: () => { throw 'plain text'; }, newBlockId: () => 'x' })), ['m-a: plain text']);
  const partial = safe(() => recordBlocks(blocks, { append: (mechanism) => { if (mechanism === 'm-a') throw new Error('nope'); }, newBlockId: () => 'x' }));
  check('only the blocks that fail are reported', partial, ['m-a: nope']);
  const real = safe(() => recordBlocks([{ mechanism: 'm-real', event: 'Stop', toolUseId: null, inputDigest: 'd', reason: 'why' }]));
  const realRecords = linesOfJournal(path.join(stateRoot, 'm-real', 'journal.jsonl'));
  check('the real writer journals under the state root and the ids of two blocks differ', [real, realRecords.length, realRecords[0]?.kind, realRecords[0]?.v, realRecords[0]?.reason], [[], 1, 'decision', 2, 'why']);
  recordBlocks([{ mechanism: 'm-real', event: 'Stop', toolUseId: null, inputDigest: 'd', reason: 'why' }]);
  const twice = linesOfJournal(path.join(stateRoot, 'm-real', 'journal.jsonl'));
  check('two blocks of one mechanism get two block ids', new Set(twice.map((record) => record.blockId)).size, 2);
  check('a mechanism that is not a plain name is a reported failure, not a throw', safe(() => recordBlocks([{ mechanism: '../x', event: 'Stop', toolUseId: null, inputDigest: 'd' }])).length, 1);

  // --- the real dispatcher process, on guards built here ---
  const guard = (name, body, registrations) => {
    const file = path.join(root, name);

    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    if (registrations !== undefined) writeFileSync(`${file}.hook-registration.json`, JSON.stringify({ registrations, why: 'fixture' }));
  };
  const manifest = (name, guards, event = 'PreToolUse') => {
    const file = path.join(root, name);

    writeFileSync(file, JSON.stringify({ event, guards }));

    return file;
  };
  const outputGuard = (output) => `export function evaluate() { return ${JSON.stringify(output)}; }\n`;
  const commandGuard = (output) => `export function evaluate(raw) { return JSON.parse(raw).tool_input.command === 'bad' ? ${JSON.stringify(output)} : undefined; }\n`;

  guard('folder-one/deny.mjs', commandGuard(deny('DENIED-ONE')));
  guard('folder-two/deny.mjs', commandGuard(deny('DENIED-TWO')));
  guard('folder-two/also.mjs', commandGuard(deny('ALSO-TWO')));
  guard('folder-ask/ask.mjs', outputGuard({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'Q' } }));
  guard('folder-note/note.mjs', outputGuard({ systemMessage: 'just a note' }));
  guard('folder-stop/block.mjs', outputGuard({ decision: 'block', reason: 'STOP-BLOCK' }));
  guard('folder-halt/halt.mjs', outputGuard({ continue: false, stopReason: 'HALT' }));
  guard('folder-long/deny.mjs', commandGuard(deny('L'.repeat(REASON_LIMIT + 50))));
  guard('folder-broken/throws.mjs', 'export function evaluate() { throw new Error("boom"); }\n');

  const run = (manifestFile, input, env = {}) => spawnSync(process.execPath, [path.join(HERE, 'dispatch.mjs'), manifestFile], { input, encoding: 'utf8', env: { ...process.env, ...env } });
  const toolPayload = (command, extra = {}) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'toolu_run', tool_input: { command }, ...extra });
  const journalOf = (mechanism) => {
    const file = path.join(stateRoot, mechanism, 'journal.jsonl');

    return linesOfJournal(file);
  };
  const shell = manifest('shell.json', ['folder-one/deny.mjs', 'folder-ask/ask.mjs', 'folder-note/note.mjs']);

  const clean = run(shell, toolPayload('ok'));
  check('a clean command writes no journal at all, though an ask and a note were said', [clean.status, json(clean.stdout), journalOf('folder-one'), existsSync(path.join(stateRoot, 'folder-ask')), existsSync(path.join(stateRoot, 'folder-note'))], [0, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'Q' }, systemMessage: 'just a note' }, [], false, false]);

  const unreadable = run(shell, 'not json');
  check('a payload that is not JSON is not a fatal dispatcher error and journals nothing', [unreadable.status, (json(unreadable.stdout).systemMessage ?? '').includes('no pudo correr'), journalOf('folder-one')], [0, false, []]);

  const bad = run(shell, toolPayload('bad'));
  const [decision, ...others] = journalOf('folder-one');
  check('a deny is journaled once, as a decision of the guard folder', [bad.status, others.length, decision?.v, decision?.kind, decision?.reason, decision?.event, decision?.toolUseId], [0, 0, 2, 'decision', 'DENIED-ONE', 'PreToolUse', 'toolu_run']);
  check('the record carries a block id, a digest of the tool input and the clock', [typeof decision?.blockId, (decision?.blockId ?? '').length > 0, decision?.inputDigest, typeof decision?.ts], ['string', true, digestInput({ command: 'bad' }), 'string']);
  check('a block that is journaled says nothing on stderr and reports nothing', bad.stderr, '');
  check('the hook output is the deny and the note, as ever', json(bad.stdout), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'DENIED-ONE' }, systemMessage: 'just a note' });
  check('an ask and a note journal nothing', [existsSync(path.join(stateRoot, 'folder-ask')), existsSync(path.join(stateRoot, 'folder-note'))], [false, false]);
  const secret = run(shell, toolPayload('bad', { tool_input: { command: 'bad', secret: 'hunter2-token' } }));
  check('the command text is never written to any journal', [secret.status, (existsSync(path.join(stateRoot, 'folder-one', 'journal.jsonl')) ? readFileSync(path.join(stateRoot, 'folder-one', 'journal.jsonl'), 'utf8') : '').includes('hunter2')], [0, false]);

  const twoFolders = manifest('two-folders.json', ['folder-one/deny.mjs', 'folder-two/deny.mjs', 'folder-two/also.mjs']);
  const before = journalOf('folder-one').length;
  run(twoFolders, toolPayload('bad'));
  const afterTwo = journalOf('folder-one').length;
  check('each blocking guard journals in its own folder: two guards of one folder journal twice there', [afterTwo - before, journalOf('folder-two').map((record) => record.reason)], [1, ['DENIED-TWO', 'ALSO-TWO']]);
  check('the blocks of one run have distinct block ids', new Set([...journalOf('folder-one').slice(-1), ...journalOf('folder-two')].map((record) => record.blockId)).size, 3);

  const stop = run(manifest('stop.json', ['folder-stop/block.mjs', 'folder-halt/halt.mjs'], 'Stop'), JSON.stringify({ hook_event_name: 'Stop', session_id: 's-1' }));
  check('a Stop block and a continue-false are journaled with the Stop event, no tool use, the digest of the payload and their reasons', [stop.status, journalOf('folder-stop').map((record) => [record.event, record.toolUseId, record.reason, record.inputDigest]), journalOf('folder-halt').map((record) => [record.event, record.toolUseId, record.reason])], [0, [['Stop', null, 'STOP-BLOCK', digestInput(JSON.stringify({ hook_event_name: 'Stop', session_id: 's-1' }))]], [['Stop', null, 'HALT']]]);
  run(manifest('long.json', ['folder-long/deny.mjs']), toolPayload('bad'));
  check('a long reason is truncated in the journal', journalOf('folder-long')[0]?.reason?.length, REASON_LIMIT);

  const withBroken = run(manifest('broken.json', ['folder-broken/throws.mjs', 'folder-one/deny.mjs']), toolPayload('bad'));
  check('a broken guard journals nothing, the block next to it is journaled and the output keeps both the deny and the notice', [journalOf('folder-broken'), journalOf('folder-one').length, json(withBroken.stdout).hookSpecificOutput?.permissionDecision, (json(withBroken.stdout).systemMessage ?? '').includes('throws.mjs')], [[], afterTwo + 1, 'deny', true]);

  // --- a journal that cannot be written changes nothing the hook says ---
  const failRoot = path.join(root, 'fail-state');

  mkdirSync(failRoot, { recursive: true });
  writeFileSync(path.join(failRoot, 'folder-one'), 'a file where the state directory of folder-one should be');

  const errorFiles = [path.join(stateDir('hook-dispatch'), 'errors.jsonl'), path.join(failRoot, 'hook-dispatch', 'errors.jsonl')];
  const linesOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line !== '') : []);
  const countsBefore = errorFiles.map((file) => linesOf(file).length);
  const unwritable = run(shell, toolPayload('bad'), { HOOK_STATE_DIR: failRoot });

  check('with a journal that cannot be written the stdout is byte for byte the one of a working journal, exit 0', [unwritable.stdout, unwritable.status], [bad.stdout, 0]);
  check('the failure is reported on stderr and names the mechanism', /^\[hook-dispatch\] .*folder-one/m.test(unwritable.stderr), true);

  const grown = errorFiles.map((file, index) => linesOf(file).slice(countsBefore[index])).flat();

  check('the failure is reported in the dispatch journal as journalFailures, naming the mechanism', [grown.length, grown.at(-1)?.includes('journalFailures'), grown.at(-1)?.includes('folder-one')], [1, true, true]);

  const failedFirst = run(manifest('failed-and-ok.json', ['folder-one/deny.mjs', 'folder-two/deny.mjs']), toolPayload('bad'), { HOOK_STATE_DIR: failRoot });

  check('a failed write does not stop the other guard from being journaled or the deny from being said', [failedFirst.status, json(failedFirst.stdout).hookSpecificOutput?.permissionDecision, existsSync(path.join(failRoot, 'folder-two', 'journal.jsonl'))], [0, 'deny', true]);

  // --- a dismissal joins its decision (the id the dispatcher wrote is the id dismiss.mjs takes) ---
  const blockId = decision?.blockId ?? '';
  safe(() => recordOutcome('folder-one', { blockId, reason: 'the rule was wrong here', falsePositive: false }));
  const joined = safe(() => classifyBlocks(readMechanism('folder-one', readdirSync).records));
  check('a dismissal of the id the dispatcher wrote is not an orphan and labels that block false, self-reported', [joined.orphaned, joined.labels?.get(blockId), joined.decisions?.get(blockId)?.kind], [[], { label: 'false', sampled: false }, 'decision']);
  check('the state directory the dispatcher used is the one dismiss.mjs resolves', stateDir('folder-one'), path.join(stateRoot, 'folder-one'));
}

for (const [key, value] of Object.entries(saved)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
