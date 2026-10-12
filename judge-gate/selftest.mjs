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
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
const { JUDGES, hookCommand } = await import('./judges.mjs');
const { decide, NESTED_VARIABLE } = await import('./gate.mjs');
const { askModel, modelArguments } = await import('./model.mjs');
const { outcomesPath, recordOutcome } = await import('./outcome-log.mjs');

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
const gate = (raw, ask, judge = voice, nested = false) => decide({ judge, raw, ask, nested });

const continued = await gate(payload({ stop_hook_active: true }), answering('{"ok": false, "reason": "VOICE-JUDGE: x"}'));

check('gate: a continued stop passes in code', continued.outcome, 'pass-continued');
check('gate: a continued stop never asks the model', asked.length, 0);
check('gate: a continued stop costs nothing', [continued.costUsd, continued.reason], [0, undefined]);

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
check('gate: a BOM before the input is tolerated', (await gate(`﻿${payload()}`, answering('{"ok": true}'))).outcome, 'pass');

const passes = await gate(payload(), answering('{"ok": true}'));

check('gate: an ok true verdict passes', passes.outcome, 'pass');
check('gate: the cost and the latency of the call are kept', [passes.costUsd, passes.durationMs], [0.0002, 900]);
check('gate: the rubric goes to the model with the hook input in place of $ARGUMENTS', asked.at(-1)?.includes(JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', stop_hook_active: false, last_assistant_message: message })), true);
check('gate: nothing of $ARGUMENTS is left in the prompt', asked.at(-1)?.includes('$ARGUMENTS'), false);
check('gate: the premise judge asks its own rubric', (await gate(payload(), answering('{"ok": true}'), premise)).outcome === 'pass' && asked.at(-1)?.startsWith(premise.prompt.split('\n')[0]), true);

const blocks = await gate(payload(), answering(JSON.stringify({ ok: false, reason: goodBlock })));

check('gate: a marked ok false blocks with its reason', [blocks.outcome, blocks.reason], ['block', goodBlock]);

const stray = await gate(payload(), answering('{"ok": false, "reason": "insufficient evidence in transcript"}'));

check('gate: an ok false that is not a rubric verdict passes as a malfunction', [stray.outcome, stray.reason], ['malfunction', undefined]);
check('gate: a model that answers prose passes as a malfunction', (await gate(payload(), answering('Sorry, I cannot.'))).outcome, 'malfunction');

const down = await gate(payload(), failing);

check('gate: a model call that throws passes as a malfunction', [down.outcome, down.why?.includes('model unavailable')], ['malfunction', true]);
check('gate: a failed model call has no reason to block with', down.reason, undefined);

// --- OUTCOME LOG. @es REGISTRO DE DESENLACES.
recordOutcome('voice', 's1', { outcome: 'block', costUsd: 0.0002, durationMs: 900, reason: goodBlock });
recordOutcome('premise', 's1', { outcome: 'malfunction', costUsd: 0, durationMs: 4, why: 'nope' });

const lines = readFileSync(outcomesPath(), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));

check('log: one line per outcome', lines.length, 2);
check('log: a line names judge, session, outcome, cost and latency', [lines[0].judge, lines[0].session, lines[0].outcome, lines[0].costUsd, lines[0].durationMs], ['voice', 's1', 'block', 0.0002, 900]);
check('log: a line carries a timestamp', Number.isFinite(Date.parse(lines[0].ts)), true);
check('log: a malfunction keeps its why', lines[1].why, 'nope');
check('log: the reason is kept for a block', lines[0].reason, goodBlock);
check('log: the file lives under the judge-gate state directory', outcomesPath().startsWith(path.resolve(process.env.HOOK_STATE_DIR)) && outcomesPath().includes('judge-gate'), true);

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

check('model: the answer is the result field', reply.answer, '{"ok": true}');
check('model: the cost is total_cost_usd', reply.costUsd, 0.00013);
check('model: the latency is measured around the call', Number.isFinite(reply.durationMs) && reply.durationMs >= 0, true);
check('model: the prompt goes in on stdin', spawned.at(-1).options.input, 'PROMPT TEXT');
check('model: the child is marked as nested', spawned.at(-1).options.env[NESTED_VARIABLE], '1');
check('model: the child runs with the timeout', spawned.at(-1).options.timeout, 5000);

const thrownBy = async (stdout, status = 0) => {
  try {
    await askModel('x', { spawn: fakeSpawn(stdout, status), timeoutMs: 1 });
  } catch (error) {
    return error.message;
  }

  return '';
};

check('model: a non-zero exit throws a bilingual error', (await thrownBy('', 1)).includes('@es'), true);
check('model: an unreadable envelope throws a bilingual error', (await thrownBy('not json')).includes('@es'), true);
check('model: an error envelope throws a bilingual error', (await thrownBy(JSON.stringify({ result: 'x', is_error: true }))).includes('@es'), true);
check('model: an envelope with no result throws a bilingual error', (await thrownBy(JSON.stringify({ is_error: false }))).includes('@es'), true);

// --- CLI. @es CLI.
const RUN = path.join(HERE, 'run.mjs');
const runCli = (cliArgs, input, env = {}) => spawnSync(process.execPath, [RUN, ...cliArgs], { input, encoding: 'utf8', env: { ...process.env, ...env, HOOK_STATE_DIR: process.env.HOOK_STATE_DIR } });
const continuedRun = runCli(['voice'], payload({ stop_hook_active: true }));

check('cli: a continued stop exits 0 and prints nothing', [continuedRun.status, continuedRun.stdout, continuedRun.stderr], [0, '', '']);
check('cli: the continued stop was logged', readFileSync(outcomesPath(), 'utf8').includes('"pass-continued"'), true);

const nestedRun = runCli(['premise'], payload(), { [NESTED_VARIABLE]: '1' });

check('cli: a nested run exits 0 and prints nothing', [nestedRun.status, nestedRun.stdout], [0, '']);

const unknownRun = runCli(['tone'], payload());

check('cli: an unknown judge exits 0 (a hook never holds a turn by its own fault) and says so in both languages', [unknownRun.status, unknownRun.stdout, unknownRun.stderr.includes('@es')], [0, '', true]);

const garbageRun = runCli(['voice'], 'garbage');

check('cli: unreadable stdin exits 0 and prints nothing', [garbageRun.status, garbageRun.stdout], [0, '']);
check('cli: unreadable stdin is logged as a malfunction', readFileSync(outcomesPath(), 'utf8').includes('"malfunction"'), true);

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
check('settings: the two judges are two hooks', new Set(stopHooks.filter((hook) => hook.command?.includes('judge-gate/run.mjs')).map((hook) => hook.command)).size, 2);
check('settings: no prompt-type hook is left on Stop', stopHooks.filter((hook) => hook.type === 'prompt').length, 0);

const sidecarPath = `${RUN}.hook-registration.json`;

check('sidecar: run.mjs declares its Stop registration', existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf8')).registrations : null, [{ event: 'Stop' }]);

for (const judge of Object.values(JUDGES)) {
  check(`rubric: the ${judge.name} rubric no longer asks the model to test stop_hook_active`, judge.prompt.includes('If the input field stop_hook_active is true'), false);
  check(`rubric: the ${judge.name} rubric tells the model the gate passes continued stops in code`, judge.prompt.includes('The gate in front of you already passed every continued stop (stop_hook_active true) in code, so you only see first stops.'), true);
}

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
