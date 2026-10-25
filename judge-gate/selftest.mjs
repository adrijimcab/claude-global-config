#!/usr/bin/env node
/**
 * Selftest of the judge gate: what a rubric verdict IS (`verdict.mjs`), what the gate decides in code before and
 * after the model answers (`gate.mjs`), what it writes down (`outcome-log.mjs`), the model call's command line
 * (`model.mjs`), the CLI as the harness runs it (`run.mjs`) and the WIRING of both judges in `settings.json`.
 * No test calls a real model: the model is a seam, and the CLI is driven only through paths that never ask it.
 *
 * @es Selftest de la compuerta de los jueces: qué ES un veredicto de rúbrica, qué decide la compuerta en código
 * antes y después de que el modelo conteste, qué deja escrito, la línea de comandos de la llamada al modelo, la
 * CLI tal como la corre el harness y el CABLEADO de ambos jueces en `settings.json`. Ningún test llama a un
 * modelo real: el modelo es un punto de inyección y la CLI solo se maneja por caminos que nunca lo consultan.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE = mkdtempSync(path.join(tmpdir(), 'judge-gate-state-'));

process.env.HOOK_STATE_DIR = STATE;
isolateState('judge-gate');

/**
 * COMPLETION SENTINEL: an import that ran a module's `main()` would end this process half way, green.
 * @es CENTINELA: un import que corriera el `main()` de un módulo terminaría este proceso a mitad, en verde.
 */
let summarised = false;
process.on('exit', () => {
  rmSync(STATE, { recursive: true, force: true });
  if (summarised) return;

  console.error('FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen');
  process.exitCode = 1;
});

const { readVerdict } = await import('./verdict.mjs');
const { hookCommand, importJudgeModule, JUDGE_NAMES, loadJudge, loadJudges } = await import('./judges.mjs');
const JUDGES = await loadJudges();
const { decide, MAX_BLOCKS_PER_TURN, NESTED_VARIABLE } = await import('./gate.mjs');
const { askModel, modelArguments } = await import('./model.mjs');
const { blocksThisTurn: readTurnCount, lastBlockTimeThisTurn, outcomesPath, recordOutcome } = await import('./outcome-log.mjs');

// The count as a value even when it throws, so a broken reader fails a check instead of crashing the run. @es El conteo como valor aun si lanza.
const blocksThisTurn = (judge, session) => {
  try {
    return readTurnCount(judge, session);
  } catch (error) {
    return `threw: ${error.message}`;
  }
};
const { isNested } = await import('./nesting.mjs');
const { run } = await import('./run.mjs');

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 240)}, expected ${JSON.stringify(expected)?.slice(0, 240)}`);
};

const voice = JUDGES.voice;
const premise = JUDGES.premise;
const goodBlock = `${voice.marker} rewrite it as a mentor would`;

// --- VERDICT. @es VEREDICTO.
check('verdict: ok true passes', readVerdict('{"ok": true}', voice.marker), { kind: 'pass' });
check('verdict: ok false with the marked reason blocks', readVerdict(JSON.stringify({ ok: false, reason: goodBlock }), voice.marker), { kind: 'block', reason: goodBlock });
check('verdict: prose around the JSON object is tolerated', readVerdict('Here you go:\n{"ok": true}\n', voice.marker), { kind: 'pass' });
check('verdict: a fenced JSON object is read', readVerdict('```json\n{"ok": true}\n```', voice.marker), { kind: 'pass' });
check('verdict: a reason that is not the judge\'s marked one is a malfunction, never a block', readVerdict('{"ok": false, "reason": "insufficient evidence in transcript"}', voice.marker).kind, 'malfunction');
check('verdict: the other judge\'s marker is not this judge\'s', readVerdict(JSON.stringify({ ok: false, reason: `${premise.marker} x` }), voice.marker).kind, 'malfunction');
check('verdict: ok false without a reason is a malfunction', readVerdict('{"ok": false}', voice.marker).kind, 'malfunction');
check('verdict: a non-string reason is a malfunction', readVerdict('{"ok": false, "reason": 3}', voice.marker).kind, 'malfunction');
check('verdict: ok that is not a boolean is a malfunction', readVerdict('{"ok": "true"}', voice.marker).kind, 'malfunction');
check('verdict: no JSON is a malfunction', readVerdict('I cannot judge this', voice.marker).kind, 'malfunction');
check('verdict: empty is a malfunction', readVerdict('', voice.marker).kind, 'malfunction');
check('verdict: an unparsable object is a malfunction', readVerdict('{ok: true', voice.marker).kind, 'malfunction');
check('verdict: an array is a malfunction', readVerdict('[true]', voice.marker).kind, 'malfunction');
check('verdict: a string ok is a malfunction even with a marked reason', readVerdict(JSON.stringify({ ok: 'false', reason: goodBlock }), voice.marker).kind, 'malfunction');
check('verdict: a reason padded with blanks is trimmed', readVerdict(JSON.stringify({ ok: false, reason: `  ${goodBlock}\n` }), voice.marker), { kind: 'block', reason: goodBlock });
const kindOf = (answer) => {
  try {
    return readVerdict(answer, voice.marker).kind;
  } catch {
    return 'threw';
  }
};

check('verdict: an object that is not JSON is a malfunction, never an exception', kindOf('{ok: true}'), 'malfunction');
check('verdict: an answer that is not text is a malfunction', [readVerdict(undefined, voice.marker).kind, readVerdict(null, voice.marker).kind], ['malfunction', 'malfunction']);
check('verdict: impossible is ignored, a marked block stays a block', readVerdict(JSON.stringify({ ok: false, impossible: true, reason: goodBlock }), voice.marker), { kind: 'block', reason: goodBlock });
check('verdict: the malfunction says why', typeof readVerdict('nope', voice.marker).why, 'string');

// --- GATE. @es COMPUERTA.
const asked = [];
const answering = (answer, extra = {}) => async (prompt) => {
  asked.push(prompt);

  return { answer, costUsd: 0.0002, durationMs: 900, ...extra };
};
const failing = async () => {
  throw new Error('model unavailable');
};
const message = 'Listo. Hecho.';
const payload = (extra = {}) => JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', stop_hook_active: false, last_assistant_message: message, ...extra });
const gate = (raw, ask, judge = voice, nested = false, blocks = () => 0) => decide({ judge, raw, ask, nested, blocksThisTurn: blocks });

// --- CONTINUED STOPS. @es PARADAS CONTINUADAS.
const blockingAnswer = answering(JSON.stringify({ ok: false, reason: goodBlock }));
const afterBlocks = (count, judge = voice) => gate(payload({ stop_hook_active: true }), blockingAnswer, judge, false, () => count);

asked.length = 0;
check('gate: a first stop is judged', [(await gate(payload(), blockingAnswer)).outcome, asked.length], ['block', 1]);
check('gate: the turn is never counted for a first stop', (await gate(payload(), blockingAnswer, voice, false, () => { throw new Error('must not be read'); })).outcome, 'block');
check('gate: the cap is two blocks per turn', MAX_BLOCKS_PER_TURN, 2);

asked.length = 0;
const continuedFirst = await afterBlocks(1);

check('gate: a continued stop after 1 block is judged', [continuedFirst.outcome, continuedFirst.reason, asked.length], ['block', goodBlock, 1]);
check('gate: a judged continued stop is marked continued', continuedFirst.continued, true);
check('gate: a judged continued stop that passes is marked continued', (await gate(payload({ stop_hook_active: true }), answering('{"ok": true}'), voice, false, () => 1)).continued, true);
check('gate: a continued stop after 0 blocks is judged', (await afterBlocks(0)).outcome, 'block');

asked.length = 0;
const capped = await afterBlocks(2);

check('gate: a continued stop after 2 blocks passes as pass-continued-capped', capped.outcome, 'pass-continued-capped');
check('gate: a capped stop never asks the model', asked.length, 0);
check('gate: a capped stop costs nothing, has no reason and is marked continued', [capped.costUsd, capped.reason, capped.continued], [0, undefined, true]);
check('gate: more than 2 blocks stay capped', (await afterBlocks(5)).outcome, 'pass-continued-capped');
check('gate: the premise judge is capped the same way', (await afterBlocks(2, premise)).outcome, 'pass-continued-capped');
check('gate: the premise judge is judged after 1 block', (await gate(payload({ stop_hook_active: true }), answering(JSON.stringify({ ok: false, reason: `${premise.marker} x` })), premise, false, () => 1)).outcome, 'block');

// --- PREFILTER AND APPENDIX: a judge may carry a cheap code test that decides whether the model is asked at
// all, and a fixed text the gate adds to its block. @es PREFILTRO Y APÉNDICE.
const seenByPrefilter = [];
const withPrefilter = (answer, extra = {}) => ({ ...voice, prefilter: (parsed) => { seenByPrefilter.push(parsed); return answer; }, ...extra });

asked.length = 0;
seenByPrefilter.length = 0;
const filteredOut = await gate(payload(), blockingAnswer, withPrefilter(false));

check('prefilter: a message the prefilter rejects passes as pass-prefilter with no model call', [filteredOut.outcome, filteredOut.costUsd, filteredOut.durationMs, asked.length], ['pass-prefilter', 0, 0, 0]);
check('prefilter: it receives the parsed hook input', [seenByPrefilter.length, seenByPrefilter[0]?.last_assistant_message], [1, message]);
check('prefilter: a rejected continued stop is marked continued', (await gate(payload({ stop_hook_active: true }), blockingAnswer, withPrefilter(false), false, () => 0)).continued, true);

asked.length = 0;
check('prefilter: a message the prefilter accepts is judged', [(await gate(payload(), blockingAnswer, withPrefilter(true))).outcome, asked.length], ['block', 1]);
asked.length = 0;

const prefilterThrew = await gate(payload(), blockingAnswer, withPrefilter(false, { prefilter: () => { throw new Error('store down'); } }));

check('prefilter: a prefilter that throws is a malfunction that passes, with no model call', [prefilterThrew.outcome, prefilterThrew.why, asked.length], ['malfunction', 'store down', 0]);

seenByPrefilter.length = 0;
await gate(payload({ last_assistant_message: '   ' }), blockingAnswer, withPrefilter(true));
await gate(payload(), blockingAnswer, withPrefilter(true), true);
await gate(payload({ stop_hook_active: true }), blockingAnswer, withPrefilter(true), false, () => 2);
check('prefilter: it is never asked for a nested run, an empty message or a capped stop', seenByPrefilter.length, 0);

const appended = await gate(payload({ session_id: 'sess-9' }), blockingAnswer, withPrefilter(true, { appendix: (parsed) => `DISMISS ${parsed.session_id}` }));

check('appendix: a block carries the judge reason and then the fixed text built from the input', appended.reason, `${goodBlock}\n\nDISMISS sess-9`);
check('appendix: a pass carries no reason', (await gate(payload(), answering('{"ok": true}'), withPrefilter(true, { appendix: () => 'X' }))).reason, undefined);

const appendixThrew = await gate(payload(), blockingAnswer, withPrefilter(true, { appendix: () => { throw new Error('boom'); } }));

check('appendix: an appendix that throws is a malfunction that passes', [appendixThrew.outcome, appendixThrew.why, appendixThrew.reason], ['malfunction', 'boom', undefined]);

// --- OBSERVE: a judge may carry a step run on EVERY readable stop, before any early return (the pending judge's
// turn window). @es OBSERVAR: un paso que corre en TODA parada legible, antes de cualquier salida temprana.
const observed = [];
const observing = (extra = {}) => ({ ...voice, observe: (parsed) => observed.push(parsed.session_id), ...extra });

observed.length = 0;
await gate(payload({ session_id: 'o1' }), blockingAnswer, observing(), true);
await gate(payload({ session_id: 'o2', stop_hook_active: true }), blockingAnswer, observing(), false, () => MAX_BLOCKS_PER_TURN);
await gate(payload({ session_id: 'o3', last_assistant_message: '' }), blockingAnswer, observing());
await gate(payload({ session_id: 'o4', stop_hook_active: true }), blockingAnswer, observing(), false, () => { throw new Error('log unreadable'); });
await gate(payload({ session_id: 'o5' }), blockingAnswer, observing({ prefilter: () => false }));
await gate(payload({ session_id: 'o6' }), failing, observing());
await gate(payload({ session_id: 'o7' }), blockingAnswer, observing());
await gate('not json', blockingAnswer, observing());
check('observe: a nested, capped, empty, uncounted, prefiltered, failed and judged stop are each observed once; an unreadable one never', observed, ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7']);

const order = [];

await gate(payload(), blockingAnswer, observing({ observe: () => order.push('observe'), prefilter: () => (order.push('prefilter'), true) }));
check('observe: it runs before the prefilter', order, ['observe', 'prefilter']);

asked.length = 0;
const observeThrew = await gate(payload({ stop_hook_active: true }), blockingAnswer, observing({ observe: () => { throw new Error('window down'); } }), false, () => 0);

check('observe: a throw there is a malfunction that passes, marked continued, with no model call', [observeThrew.outcome, observeThrew.why, observeThrew.continued, observeThrew.reason, asked.length], ['malfunction', 'window down', true, undefined, 0]);

// --- FALLBACK: a judge may carry a block for when it cannot answer. @es RESPALDO: un bloqueo para cuando no responde.
const withFallback = (extra = {}) => ({ ...voice, fallback: (parsed, why) => `FALLBACK ${String(parsed.session_id)} ${why}`, ...extra });
const fellBack = await gate(payload({ session_id: 'f1' }), failing, withFallback());

check('fallback: a failed model call blocks with the fallback text and keeps why', [fellBack.outcome, fellBack.reason, fellBack.why, fellBack.costUsd, fellBack.durationMs], ['block', 'FALLBACK f1 model unavailable', 'model unavailable', 0, 0]);

const fellBackProse = await gate(payload({ session_id: 'f2' }), answering('Sorry, I cannot.'), withFallback());

check('fallback: an answer that is no verdict blocks with the fallback, keeping its cost and latency', [fellBackProse.outcome, fellBackProse.reason?.startsWith('FALLBACK f2 '), typeof fellBackProse.why, fellBackProse.costUsd, fellBackProse.durationMs], ['block', true, 'string', 0.0002, 900]);
check('fallback: a continued stop that falls back is marked continued', (await gate(payload({ stop_hook_active: true }), failing, withFallback(), false, () => 0)).continued, true);

const fallbackThrew = await gate(payload(), failing, withFallback({ fallback: () => { throw new Error('no text'); } }));

check('fallback: a fallback that throws is a malfunction that passes, saying both whys', [fallbackThrew.outcome, fallbackThrew.why, fallbackThrew.reason], ['malfunction', 'model unavailable; no text', undefined]);
check('fallback: a judged pass never falls back', (await gate(payload(), answering('{"ok": true}'), withFallback())).outcome, 'pass');
check('fallback: a judged block keeps the judge reason', (await gate(payload(), blockingAnswer, withFallback())).reason, goodBlock);
check('fallback: a count that cannot be read never falls back', (await gate(payload({ stop_hook_active: true }), failing, withFallback(), false, () => { throw new Error('log unreadable'); })).outcome, 'malfunction');
check('fallback: a prefilter that throws never falls back', (await gate(payload(), failing, withFallback({ prefilter: () => { throw new Error('p'); } }))).outcome, 'malfunction');
check('fallback: an appendix that throws never falls back', (await gate(payload(), blockingAnswer, withFallback({ appendix: () => { throw new Error('a'); } }))).outcome, 'malfunction');
check('fallback: an unreadable input never falls back', (await gate('not json', failing, withFallback())).outcome, 'malfunction');

const countFailed = await gate(payload({ stop_hook_active: true }), blockingAnswer, voice, false, () => { throw new Error('log unreadable'); }).catch((error) => ({ outcome: 'threw', why: error.message }));

check('gate: a failure reading the count passes as a malfunction', [countFailed.outcome, countFailed.why?.includes('log unreadable'), countFailed.reason], ['malfunction', true, undefined]);
check('gate: a failure reading the count is marked continued', countFailed.continued, true);
asked.length = 0;
check('gate: a continued stop with no message passes without asking', [(await gate(payload({ stop_hook_active: true, last_assistant_message: '' }), blockingAnswer, voice, false, () => 0)).outcome, asked.length], ['pass-no-message', 0]);
asked.length = 0;

const nested = await gate(payload(), answering('{"ok": false, "reason": "VOICE-JUDGE: x"}'), voice, true);

check('gate: a call nested inside the judge\'s own model run passes', nested.outcome, 'pass-nested');
check('gate: a nested call never asks the model', asked.length, 0);

const empty = await gate(payload({ last_assistant_message: '   ' }), answering('{"ok": false, "reason": "VOICE-JUDGE: x"}'));

check('gate: a stop with no message passes without asking', [empty.outcome, asked.length], ['pass-no-message', 0]);
check('gate: a stop with no message field passes without asking', (await gate(JSON.stringify({ stop_hook_active: false }), answering('{"ok": true}'))).outcome, 'pass-no-message');

const unreadable = await gate('not json', answering('{"ok": true}'));

check('gate: unreadable input is a malfunction that passes', [unreadable.outcome, typeof unreadable.why], ['malfunction', 'string']);
check('gate: unreadable input has no block reason', unreadable.reason, undefined);
check('gate: an input that is not an object is a malfunction', (await gate('3', answering('{"ok": true}'))).outcome, 'malfunction');
check('gate: an array input is a malfunction', (await gate('[1]', answering('{"ok": true}'))).outcome, 'malfunction');
check('gate: a BOM before the input is tolerated', (await gate(`﻿${payload()}`, answering('{"ok": true}'))).outcome, 'pass');

const passes = await gate(payload(), answering('{"ok": true}'));

check('gate: an ok true verdict passes', passes.outcome, 'pass');
check('gate: the cost and the latency of the call are kept', [passes.costUsd, passes.durationMs], [0.0002, 900]);
check('gate: the rubric goes to the model with the hook input in place of $ARGUMENTS', asked.at(-1)?.includes(JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', stop_hook_active: false, last_assistant_message: message })), true);
check('gate: nothing of $ARGUMENTS is left in the prompt', asked.at(-1)?.includes('$ARGUMENTS'), false);
check('gate: the premise judge asks its own rubric', (await gate(payload(), answering('{"ok": true}'), premise)).outcome === 'pass' && asked.at(-1)?.startsWith(premise.prompt.split('\n')[0]), true);

const blocks = await gate(payload(), answering(JSON.stringify({ ok: false, reason: goodBlock })));

check('gate: a marked ok false blocks with its reason', [blocks.outcome, blocks.reason], ['block', goodBlock]);
check('gate: a block keeps the cost and latency', [blocks.costUsd, blocks.durationMs], [0.0002, 900]);

const stray = await gate(payload(), answering('{"ok": false, "reason": "insufficient evidence in transcript"}'));

check('gate: an ok false that is not a rubric verdict passes as a malfunction', [stray.outcome, stray.reason], ['malfunction', undefined]);
check('gate: a model that answers prose passes as a malfunction', (await gate(payload(), answering('Sorry, I cannot.'))).outcome, 'malfunction');

const down = await gate(payload(), failing);

check('gate: a model call that throws passes as a malfunction', [down.outcome, down.why?.includes('model unavailable')], ['malfunction', true]);
check('gate: a failed model call has no reason to block with', down.reason, undefined);
check('gate: a malfunction keeps the cost and latency of the answer', [stray.costUsd, stray.durationMs], [0.0002, 900]);

// --- OUTCOME LOG. @es REGISTRO DE DESENLACES.
check('turn: no log yet means no blocks, not an error', blocksThisTurn('voice', 's1'), 0);
recordOutcome('voice', 's1', { outcome: 'block', costUsd: 0.0002, durationMs: 900, reason: goodBlock });
recordOutcome('premise', 's1', { outcome: 'malfunction', costUsd: 0, durationMs: 4, why: 'nope' });

const readLog = () => {
  try {
    return readFileSync(outcomesPath(), 'utf8');
  } catch {
    return '';
  }
};
const lines = readLog().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));

check('log: one line per outcome', lines.length, 2);
check('log: a line names judge, session, outcome, cost and latency', [lines[0]?.judge, lines[0]?.session, lines[0]?.outcome, lines[0]?.costUsd, lines[0]?.durationMs], ['voice', 's1', 'block', 0.0002, 900]);
check('log: a line carries a timestamp', Number.isFinite(Date.parse(lines[0]?.ts)), true);
check('log: a malfunction keeps its why', lines[1]?.why, 'nope');
check('log: the reason is kept for a block', lines[0]?.reason, goodBlock);
check('log: the file lives under the judge-gate state directory', outcomesPath().startsWith(path.resolve(process.env.HOOK_STATE_DIR)) && path.basename(path.dirname(outcomesPath())) === 'judge-gate', true);
recordOutcome('voice', 's2', { outcome: 'pass', costUsd: 0, durationMs: 1 });
check('log: a second outcome is appended, the first is kept', readLog().split('\n').filter((line) => line !== '').length, 3);

// --- TURN COUNT. @es CUENTA DEL TURNO.
const log = (judge, session, outcome, continued) => recordOutcome(judge, session, { outcome, costUsd: 0, durationMs: 1, continued });

check('turn: a session with no records has no blocks', blocksThisTurn('voice', 'turn-none'), 0);
log('voice', 'turn-a', 'block');
check('turn: the block of a first stop counts', blocksThisTurn('voice', 'turn-a'), 1);
log('voice', 'turn-a', 'block', true);
check('turn: the block of a continued stop counts', blocksThisTurn('voice', 'turn-a'), 2);
log('voice', 'turn-a', 'pass');
check('turn: a new first stop resets the count', blocksThisTurn('voice', 'turn-a'), 0);
log('voice', 'turn-a', 'block');
log('voice', 'turn-a', 'pass-continued-capped', true);
check('turn: a continued stop does not open a turn', blocksThisTurn('voice', 'turn-a'), 1);
log('voice', 'turn-b', 'block');
log('voice', 'turn-b', 'pass-continued');
log('voice', 'turn-b', 'block', true);
check('turn: a legacy pass-continued line is read as continued', blocksThisTurn('voice', 'turn-b'), 2);
log('premise', 'turn-b', 'block');
check('turn: another judge\'s blocks are not counted', blocksThisTurn('voice', 'turn-b'), 2);
log('voice', 'turn-c', 'block');
check('turn: another session\'s blocks are not counted', blocksThisTurn('voice', 'turn-none'), 0);
check('turn: a session that only has continued records counts all its blocks', (log('voice', 'turn-d', 'block', true), blocksThisTurn('voice', 'turn-d')), 1);

// --- WHEN THE TURN WAS LAST BLOCKED: the time of the newest block of the current turn, for the pending judge's
// --- dismissal lookup. @es CUÁNDO SE BLOQUEÓ POR ÚLTIMA VEZ EL TURNO.
const lastTime = (judge, session) => {
  try {
    return lastBlockTimeThisTurn(judge, session);
  } catch (error) {
    return `threw: ${error.message}`;
  }
};
const threw = (value) => typeof value === 'string' && value.startsWith('threw:');
const at = (seconds) => new Date(Date.UTC(2026, 9, 19, 12, 0, seconds)).toISOString();
const raw = (judge, session, ts, outcome, continued) => appendFileSync(outcomesPath(), `${JSON.stringify({ ts, judge, session, outcome, costUsd: 0, durationMs: 1, ...(continued ? { continued: true } : {}) })}\n`);

check('last block: a session with no records has none', lastTime('voice', 'time-none'), undefined);
raw('voice', 'time-a', at(1), 'block');
raw('voice', 'time-a', at(2), 'block', true);
raw('voice', 'time-a', at(3), 'pass', true);
check('last block: it is the newest block of the turn, not the newest record', lastTime('voice', 'time-a'), Date.parse(at(2)));
raw('voice', 'time-a', at(4), 'pass');
check('last block: a new first stop that passed leaves none', lastTime('voice', 'time-a'), undefined);
raw('voice', 'time-a', at(5), 'block');
raw('premise', 'time-a', at(6), 'block');
raw('voice', 'time-other', at(7), 'block');
check('last block: another judge\'s or session\'s block is not this one\'s', lastTime('voice', 'time-a'), Date.parse(at(5)));
check('last block: the count and the time agree', [blocksThisTurn('voice', 'time-a'), lastTime('voice', 'time-a') === Date.parse(at(5))], [1, true]);
check('last block: no session id is a failed read, never a time', threw(lastTime('voice', '')), true);

const thrownMessage = (action) => {
  try {
    action();
  } catch (error) {
    return error.message;
  }

  return '';
};

check('turn: no session id throws a bilingual error', thrownMessage(() => readTurnCount('voice', '')).includes('@es'), true);
check('turn: a session that is not text throws', thrownMessage(() => readTurnCount('voice', undefined)).includes('@es'), true);

// --- MODEL COMMAND LINE. @es LÍNEA DE COMANDOS DEL MODELO.
const args = modelArguments('haiku');
const after = (flag) => args.slice(args.indexOf(flag), args.indexOf(flag) + 2);

check('model: the model is the one asked', after('--model'), ['--model', 'haiku']);
check('model: no tools', after('--tools'), ['--tools', '']);
check('model: no setting sources, so no user hooks and no user memory', after('--setting-sources'), ['--setting-sources', '']);
check('model: a small system prompt replaces the default one (63k tokens measured)', args.includes('--system-prompt'), true);
check('model: no session is persisted', args.includes('--no-session-persistence'), true);
check('model: the answer is read as JSON so the cost is known', after('--output-format'), ['--output-format', 'json']);
check('model: skills and MCP servers are off', [args.includes('--disable-slash-commands'), args.includes('--strict-mcp-config')], [true, true]);

const spawned = [];
const fakeSpawn = (stdout, status = 0) => (command, argv, options) => {
  spawned.push({ command, argv, options });

  return { status, stdout, stderr: '' };
};
const reply = await askModel('PROMPT TEXT', { spawn: fakeSpawn(JSON.stringify({ result: '{"ok": true}', total_cost_usd: 0.00013, is_error: false })), timeoutMs: 5000 });
const firstCall = spawned.at(-1);

check('model: the answer is the result field', reply.answer, '{"ok": true}');
check('model: the cost is total_cost_usd', reply.costUsd, 0.00013);
const slowSpawn = (command, argv, options) => {
  const until = Date.now() + 25;

  while (Date.now() < until);

  return fakeSpawn(JSON.stringify({ result: '{"ok": true}', total_cost_usd: 0 }))(command, argv, options);
};

check('model: the latency is the wall time around the call', (await askModel('x', { spawn: slowSpawn, timeoutMs: 5000 })).durationMs >= 20, true);
check('model: a missing cost is zero', (await askModel('x', { spawn: fakeSpawn(JSON.stringify({ result: 'r' })), timeoutMs: 5000 })).costUsd, 0);
check('model: the prompt goes in on stdin', firstCall.options.input, 'PROMPT TEXT');
check('model: the child is marked as nested', firstCall.options.env[NESTED_VARIABLE], '1');
check('model: the child runs with the timeout', firstCall.options.timeout, 5000);

const thrownBy = async (stdout, status = 0) => {
  try {
    await askModel('x', { spawn: fakeSpawn(stdout, status), timeoutMs: 1 });
  } catch (error) {
    return error.message;
  }

  return '';
};

check('model: a non-zero exit throws a bilingual error', (await thrownBy('', 1)).includes('@es'), true);
check('model: a non-zero exit throws even when it printed a valid envelope', (await thrownBy(JSON.stringify({ result: '{"ok": true}', is_error: false }), 1)).includes('@es'), true);
check('model: an unreadable envelope throws a bilingual error', (await thrownBy('not json')).includes('@es'), true);
check('model: an error envelope throws a bilingual error', (await thrownBy(JSON.stringify({ result: 'x', is_error: true }))).includes('@es'), true);
check('model: an envelope with no result throws a bilingual error', (await thrownBy(JSON.stringify({ is_error: false }))).includes('@es'), true);

// --- RUN IN-PROCESS. @es RUN EN PROCESO.
check('nesting: the variable at 1 is nested', isNested({ [NESTED_VARIABLE]: '1' }), true);
check('nesting: any other value or none is not nested', [isNested({ [NESTED_VARIABLE]: '0' }), isNested({ [NESTED_VARIABLE]: '2' }), isNested({})], [false, false, false]);

const seen = [];
const blockingModel = async (prompt, options) => {
  seen.push(options);

  return { answer: JSON.stringify({ ok: false, reason: goodBlock }), costUsd: 0.0002, durationMs: 700 };
};
const printed = await run('voice', payload({ session_id: 'run-1' }), { model: blockingModel });

const printedDecision = (() => {
  try {
    return JSON.parse(printed);
  } catch {
    return null;
  }
})();

check('run: a block prints a Stop decision with its reason', printedDecision, { decision: 'block', reason: goodBlock });
check('run: the model call gets the judge\'s timeout', seen.at(-1), { timeoutMs: voice.askTimeoutMs });
check('run: the outcome is logged with the session', readLog().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)).some((line) => line.session === 'run-1' && line.outcome === 'block' && line.judge === 'voice'), true);
check('run: a pass prints nothing', await run('voice', payload(), { model: async () => ({ answer: '{"ok": true}', costUsd: 0, durationMs: 1 }) }), '');

// A continued stop is counted for its own judge and session, through the real log. @es Se cuenta por juez y sesión.
for (const judgeName of ['voice', 'premise']) for (let n = 0; n < MAX_BLOCKS_PER_TURN; n++) log(judgeName, `run-capped-${judgeName}`, 'block', n > 0);
seen.length = 0;

check('run: a continued stop after the cap prints nothing and never asks the model (premise)', [await run('premise', payload({ stop_hook_active: true, session_id: 'run-capped-premise' }), { model: blockingModel }), seen.length], ['', 0]);
check('run: a continued stop after the cap prints nothing and never asks the model (voice)', [await run('voice', payload({ stop_hook_active: true, session_id: 'run-capped-voice' }), { model: blockingModel }), seen.length], ['', 0]);
const underCap = await run('voice', payload({ stop_hook_active: true, session_id: 'run-1' }), { model: blockingModel });

check('run: a continued stop under the cap is judged and its block printed', [underCap.includes(goodBlock), seen.length], [true, 1]);

process.env[NESTED_VARIABLE] = '1';
seen.length = 0;
check('run: a nested process prints nothing and never asks the model', [await run('voice', payload(), { model: blockingModel }), seen.length], ['', 0]);
delete process.env[NESTED_VARIABLE];

// THE CAP NEEDS THE LOG: with a log that cannot be written or read, a continued stop never blocks again.
// @es EL TOPE NECESITA EL REGISTRO: si no se puede escribir ni leer, una parada continuada no vuelve a bloquear.
const throwingRecord = () => {
  throw new Error('log full');
};
const decisionOf = (text) => {
  try {
    return JSON.parse(text).decision;
  } catch {
    return text;
  }
};

seen.length = 0;
check('run: a first stop whose block cannot be recorded still prints its block', decisionOf(await run('voice', payload({ session_id: 'rec-1' }), { model: blockingModel, record: throwingRecord })), 'block');
check('run: a continued stop whose block cannot be recorded prints nothing, though the model was asked', [await run('voice', payload({ session_id: 'rec-1', stop_hook_active: true }), { model: blockingModel, record: throwingRecord, countBlocks: () => 0 }), seen.length], ['', 2]);
check('run: a continued stop whose block is recorded prints it', decisionOf(await run('voice', payload({ session_id: 'rec-2', stop_hook_active: true }), { model: blockingModel, countBlocks: () => 0 })), 'block');
seen.length = 0;
check('run: a continued stop whose count cannot be read prints nothing and never asks the model', [await run('voice', payload({ session_id: 'rec-3', stop_hook_active: true }), { model: blockingModel, countBlocks: () => { throw new Error('log unreadable'); } }), seen.length], ['', 0]);
check('run: the count is read for this judge and session', await (async () => {
  const counted = [];

  await run('voice', payload({ session_id: 'rec-4', stop_hook_active: true }), { model: blockingModel, countBlocks: (judgeName, session) => (counted.push([judgeName, session]), 0) });

  return counted;
})(), [['voice', 'rec-4']]);
check('run: the outcome is recorded for this judge and session', await (async () => {
  const recorded = [];

  await run('voice', payload({ session_id: 'rec-5' }), { model: blockingModel, record: (judgeName, session, outcome) => recorded.push([judgeName, session, outcome.outcome]) });

  return recorded;
})(), [['voice', 'rec-5', 'block']]);

// LOADED BY NAME: a pending judge whose module chain is broken is its own malfunction; premise and voice still run.
// @es CARGADOS POR NOMBRE: un juez de pendientes con su cadena rota es un fallo propio; premise y voice siguen.
const brokenPending = (specifier) => (specifier.startsWith('../pending-judge/') || specifier.startsWith('../backlog-guard/') ? Promise.reject(new SyntaxError('broken pending chain')) : importJudgeModule(specifier));

check('lazy: a broken pending chain fails only the pending judge load', [await loadJudge('pending', { importModule: brokenPending }).then(() => 'loaded', (error) => error.message), (await loadJudge('premise', { importModule: brokenPending }))?.name, (await loadJudge('voice', { importModule: brokenPending }))?.name], ['broken pending chain', 'premise', 'voice']);
seen.length = 0;
check('lazy: the pending judge with a broken chain prints nothing and asks no model', [await run('pending', payload({ session_id: 'lazy-1' }), { model: blockingModel, importModule: brokenPending }).catch((error) => `threw: ${error.message}`), seen.length], ['', 0]);
check('lazy: that load failure is logged as the pending judge\'s malfunction, in both languages', readLog().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)).some((line) => line.session === 'lazy-1' && line.judge === 'pending' && line.outcome === 'malfunction' && line.why.includes('the pending judge could not be loaded: broken pending chain') && line.why.includes('@es no se pudo cargar el juez pending')), true);
seen.length = 0;

const voiceDespite = await run('voice', payload({ session_id: 'lazy-2' }), { model: blockingModel, importModule: brokenPending });
const premiseDespite = await run('premise', payload({ session_id: 'lazy-3' }), { model: async (prompt, options) => (seen.push(options), { answer: JSON.stringify({ ok: false, reason: `${premise.marker} x` }), costUsd: 0, durationMs: 1 }), importModule: brokenPending });

check('lazy: voice and premise still run and block past a broken pending chain', [voiceDespite.includes(goodBlock), premiseDespite.includes(`${premise.marker} x`), seen.length], [true, true, 2]);
check('lazy: a name that is no judge loads nothing, inherited names included', [await loadJudge('tone'), await loadJudge('constructor'), await loadJudge('toString')], [undefined, undefined, undefined]);
check('lazy: every judge loads under its own name', Object.entries(JUDGES).map(([name, loaded]) => [name, loaded.name]), JUDGE_NAMES.map((name) => [name, name]));
check('lazy: judges.mjs imports no judge module when it loads', readFileSync(path.join(HERE, 'judges.mjs'), 'utf8').split('\n').filter((line) => line.startsWith('import ')), []);
check('lazy: run.mjs reaches no judge module but through the loader', readFileSync(path.join(HERE, 'run.mjs'), 'utf8').split('\n').filter((line) => line.startsWith('import ') && (line.includes('-judge/') || line.includes('backlog-guard'))), []);

// THE BILINGUAL MIRRORS of this folder name every judge. @es LOS ESPEJOS BILINGÜES nombran a cada juez.
{
  const source = (file) => readFileSync(path.join(HERE, file), 'utf8');
  const spanishHalf = (file) => source(file).slice(source(file).indexOf('@es'));

  check('mirror: run.mjs gives the three judges in its usage, in both halves', [source('run.mjs').includes('Stop command hook: `node run.mjs <premise|voice|pending>`'), source('run.mjs').includes('@es Hook de comando de Stop: `node run.mjs <premise|voice|pending>`')], [true, true]);
  check('mirror: the gate\'s Spanish half names every step the English half does', ['`observe`', '`prefilter`', '`appendix`', '`fallback`', 'corrida anidada', 'MAX_BLOCKS_PER_TURN'].map((word) => spanishHalf('gate.mjs').includes(word)), [true, true, true, true, true, true]);
  check('mirror: judges.mjs counts three judges in both halves', [source('judges.mjs').includes('The three Stop judges'), source('judges.mjs').includes('Los tres jueces de Stop'), source('judges.mjs').includes('Los dos jueces')], [true, true, false]);
  check('mirror: the hook registration names the three judges, in both languages', [JSON.parse(source('run.mjs.hook-registration.json')).why.includes('the three Stop judges (premise, voice and pending)'), JSON.parse(source('run.mjs.hook-registration.json')).why.includes('@es los tres jueces de Stop (premise, voice y pending)')], [true, true]);
}

// --- CLI. @es CLI.
const RUN = path.join(HERE, 'run.mjs');
const runCli = (cliArgs, input, env = {}) => spawnSync(process.execPath, [RUN, ...cliArgs], { input, encoding: 'utf8', env: { ...process.env, ...env, HOOK_STATE_DIR: process.env.HOOK_STATE_DIR } });
for (const blockedAt of [1, 2]) recordOutcome('voice', 'cli-capped', { outcome: 'block', costUsd: 0, durationMs: 1, reason: goodBlock, continued: blockedAt === 2 });

const continuedRun = runCli(['voice'], payload({ stop_hook_active: true, session_id: 'cli-capped' }));

check('cli: a continued stop after 2 blocks exits 0 and prints nothing', [continuedRun.status, continuedRun.stdout, continuedRun.stderr], [0, '', '']);
check('cli: the capped continued stop was logged as capped and continued', readLog().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)).some((line) => line.session === 'cli-capped' && line.outcome === 'pass-continued-capped' && line.continued === true), true);

const noSessionRun = runCli(['voice'], JSON.stringify({ stop_hook_active: true, last_assistant_message: message }));

check('cli: a continued stop with no session passes as a malfunction without asking the model', [noSessionRun.status, noSessionRun.stdout], [0, '']);
check('cli: that malfunction was logged', readLog().includes('no session id to count the turn by'), true);

const nestedRun = runCli(['premise'], payload(), { [NESTED_VARIABLE]: '1' });

check('cli: a nested run exits 0 and prints nothing', [nestedRun.status, nestedRun.stdout], [0, '']);

const unknownRun = runCli(['tone'], payload());

check('cli: an unknown judge exits 0 (a hook never holds a turn by its own fault) and says so in both languages', [unknownRun.status, unknownRun.stdout, unknownRun.stderr.includes('@es')], [0, '', true]);
check('cli: an unknown judge is told the known ones, in both languages', [unknownRun.stderr.includes('(known: premise, voice, pending)'), unknownRun.stderr.includes('(conocidos: premise, voice, pending)')], [true, true]);

const garbageRun = runCli(['voice'], 'garbage');

check('cli: unreadable stdin exits 0 and prints nothing', [garbageRun.status, garbageRun.stdout], [0, '']);
check('cli: unreadable stdin is logged as a malfunction', readLog().includes('"malfunction"'), true);

// --- WIRING. @es CABLEADO.
const settings = JSON.parse(readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8'));
const stopHooks = (settings.hooks?.Stop ?? []).flatMap((group) => group.hooks ?? []);

for (const judge of Object.values(JUDGES)) {
  const wired = stopHooks.filter((hook) => hook.command === hookCommand(judge.name));

  check(`settings: exactly one command hook runs the ${judge.name} judge`, wired.length, 1);
  check(`settings: the ${judge.name} hook is a command hook`, wired[0]?.type, 'command');
  check(`settings: the ${judge.name} hook timeout is the pinned one`, wired[0]?.timeout, judge.timeoutSeconds);
  check(`settings: no native prompt hook still carries the ${judge.name} rubric`, stopHooks.some((hook) => hook.type === 'prompt' && hook.prompt.startsWith(judge.prompt.split('\n')[0])), false);
  check(`settings: the ${judge.name} model call leaves room inside the hook timeout`, judge.askTimeoutMs < judge.timeoutSeconds * 1000, true);
}
check('settings: the judges are one hook each', new Set(stopHooks.filter((hook) => hook.command?.includes('judge-gate/run.mjs')).map((hook) => hook.command)).size, Object.keys(JUDGES).length);
check('settings: the three judges are premise, voice and pending', Object.keys(JUDGES), ['premise', 'voice', 'pending']);
check('settings: only the pending judge carries a prefilter, an appendix, a fallback and an observe step', Object.values(JUDGES).map((judge) => [typeof judge.prefilter, typeof judge.appendix, typeof judge.fallback, typeof judge.observe]), [Array(4).fill('undefined'), Array(4).fill('undefined'), Array(4).fill('function')]);
check('settings: no prompt-type hook is left on Stop', stopHooks.filter((hook) => hook.type === 'prompt').length, 0);

const sidecarPath = `${RUN}.hook-registration.json`;

check('sidecar: run.mjs declares its Stop registration', existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf8')).registrations : null, [{ event: 'Stop' }]);

for (const judge of Object.values(JUDGES)) {
  check(`rubric: the ${judge.name} rubric no longer asks the model to test stop_hook_active`, judge.prompt.includes('If the input field stop_hook_active is true'), false);
  check(`rubric: the ${judge.name} rubric tells the model it may judge the rewrite after a block`, judge.prompt.includes('the rewrite after a block') && !judge.prompt.includes('you only see first stops'), true);
}

// A torn line is appended last: the readers above parse every line of the log. @es La línea rota va al final.
appendFileSync(outcomesPath(), '{"torn\n\nnot json\n');
check('turn: a torn or blank line is skipped, never an error', blocksThisTurn('voice', 'turn-d'), 1);

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
