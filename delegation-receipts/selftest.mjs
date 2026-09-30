#!/usr/bin/env node
/**
 * Proof that the delegation-receipts guard DISCRIMINATES across the state space its decision ranges
 * over — not that it runs.
 *
 * WHY THE FIXTURES ARE CONSTRUCTED. Every transcript here is built by this file. None is read from the
 * live session, from a branch, or from any artifact that legitimately changes: a fixture that is live
 * mutable state rots on its own and reddens a correct machine, and a guard that goes red on a correct
 * tree teaches people to switch it off — which is the `guard-that-cannot-go-red` end state reached by
 * another road.
 *
 * BOTH FAILURE DIRECTIONS ARE EXERCISED, because they are not symmetric. Failing to see the hazard lets
 * the next hour of work go to nobody; refusing a legitimate turn gets the guard removed. So the table
 * carries the unretried refusal AND the retry spelled three different ways, the turn that merely talks
 * about a delegation, and the turn with no delegation at all.
 *
 * THE NEAR MISSES, which are the states nobody thinks of: a success that came BEFORE the refusal, an
 * abandonment recorded BEFORE it, an abandonment belonging to another session, a refusal that lives in
 * an EARLIER turn, and a sub-agent's own traffic. Each of those is a way of paying a debt with
 * something that is not payment.
 *
 * MULTI-BYTE. Two fixtures carry the same number of BYTES, one in ASCII and one in accented Spanish and
 * box-drawing, both larger than the first window the reader slices, and both must produce the same
 * verdict. A window sized in characters would cover different amounts of the two.
 *
 * @es Prueba de que el guard DISCRIMINA en todo el espacio de estados de su decisión. Los fixtures se
 * CONSTRUYEN aquí: uno tomado de estado vivo se pudre solo y pone rojo un árbol correcto. Se ejercitan
 * LAS DOS direcciones de fallo y los casi-aciertos (éxito ANTERIOR al rechazo, abandono anterior,
 * abandono de otra sesión, rechazo de un turno previo, tráfico de un sub-agente). Y multi-byte: dos
 * fixtures del mismo tamaño en BYTES deben dar el mismo veredicto.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordAbandonment } from './abandon.mjs';
import { owedBy } from './guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');
// Under `scratch/`, which the mutation runner treats as run output and never copies into a sandbox.
// @es Bajo `scratch/`, que el corredor de mutantes nunca copia a un sandbox.
const SCRATCH = (() => {
  const parent = path.join(HERE, 'scratch');

  mkdirSync(parent, { recursive: true });

  return mkdtempSync(path.join(parent, 'selftest-'));
})();

let failures = 0;
let checks = 0;

function check(ok, label) {
  checks += 1;

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

// --- Transcript construction, in the shape the harness really records. ------------------------------
// MEASURED against the recorded sessions of this project: a tool call is an `assistant` entry carrying a
// `tool_use` block; its result is a `user` entry carrying a `tool_result` block matched by `tool_use_id`,
// and a refusal is that result with `is_error: true`.
// @es Construcción de transcripts con la forma que el harness graba de verdad.

let clock = Date.parse('2026-09-21T03:40:00.000Z');
const tick = (seconds = 30) => new Date((clock += seconds * 1000)).toISOString();

const prompt = (text) => ({ type: 'user', timestamp: tick(), message: { role: 'user', content: text } });
const say = (text) => ({ type: 'assistant', timestamp: tick(), message: { role: 'assistant', content: [{ type: 'text', text }] } });
const call = (id, name, input) => ({ type: 'assistant', timestamp: tick(), message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, content, isError) => ({ type: 'user', timestamp: tick(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });

const REFUSAL = 'ORPHAN-WORK GUARD REFUSED this delegation: a dead agent left unlanded work in it.\nRun the reaper first.';
const LAUNCHED = 'Async agent launched successfully. (This tool result is informational.)';

const agentCall = (id, description) => call(id, 'Agent', { description, prompt: 'MEASURED: ...\nHYPOTHESIS: ...', subagent_type: 'general-purpose' });
const resumeCall = (id, to) => call(id, 'SendMessage', { to, type: 'agent', message: 'continue' });

/**
 * A fixture file name that is safe on this platform. MEASURED on Windows: a `:` taken from a case label
 * is NOT rejected — NTFS reads it as an alternate data stream separator, so the fixture is written
 * somewhere other than where it appears to be and the directory cannot afterwards be removed. Silent
 * misplacement is worse than a failure, so the name is reduced to characters that mean only themselves.
 * @es Nombre de fichero seguro. MEDIDO en Windows: un `:` no se rechaza, NTFS lo lee como separador de
 * flujo alternativo y el fixture acaba en otro sitio sin avisar. Se reduce a caracteres inocuos.
 */
const ALLOWED = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
const safeName = (label) => [...label].map((character) => (ALLOWED.includes(character) ? character : '-')).join('').slice(0, 48);

function transcript(label, entries) {
  const file = path.join(SCRATCH, `${safeName(label)}.jsonl`);

  writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');

  return file;
}

/** A payload in the shape the harness really sends, its key set captured from `.claude/fleet-env/state/probe/subagent-stop.jsonl`. @es Payload con la forma real, tomada del sondeo del harness. */
const payloadFor = (transcriptPath, sessionId, extra = {}) => ({
  session_id: sessionId,
  transcript_path: transcriptPath,
  cwd: path.resolve(HERE, '..', '..'),
  prompt_id: 'p-selftest',
  permission_mode: 'default',
  hook_event_name: 'Stop',
  stop_hook_active: false,
  last_assistant_message: 'La investigación va delegada con las dos hipótesis separadas.',
  background_tasks: [],
  session_crons: [],
  ...extra,
});

// --- THE DECISION'S STATE SPACE ---------------------------------------------------------------------

const PROLOGUE = [prompt('an earlier question'), say('an earlier answer')];

const cases = [
  [
    'refused delegation, never retried',
    1,
    [...PROLOGUE, prompt('investiga el gate que bloquea la pila'), agentCall('t1', 'Trace the missing row expander'), result('t1', REFUSAL, true), say('va delegado con las dos hipótesis separadas')],
  ],
  [
    'refused delegation, later successful Agent',
    0,
    [...PROLOGUE, prompt('investiga el gate'), agentCall('t1', 'Trace the missing row expander'), result('t1', REFUSAL, true), agentCall('t2', 'Trace the missing row expander'), result('t2', LAUNCHED, false), say('lanzado')],
  ],
  [
    'refused delegation, later successful SendMessage (the retry resume-before-fresh demands)',
    0,
    [...PROLOGUE, prompt('investiga el gate'), agentCall('t1', 'Close the 67 visual baselines'), result('t1', 'RESUME-BEFORE-FRESH REFUSED this delegation: a recent agent already holds this errand.', true), resumeCall('t2', 'a42240d'), result('t2', '{"success":true,"message":"Resuming agent a42240d"}', false)],
  ],
  [
    'successful delegation with no refusal anywhere',
    0,
    [...PROLOGUE, prompt('delega esto'), agentCall('t1', 'Guard against unretried refused delegations'), result('t1', LAUNCHED, false), say('lanzado')],
  ],
  [
    'no delegation at all in the turn',
    0,
    [...PROLOGUE, prompt('¿qué queda por hacer?'), say('quedan tres cosas')],
  ],
  [
    'the turn only TALKS about a delegation and quotes a refusal verbatim (prose is not a signal)',
    0,
    [...PROLOGUE, prompt('¿qué pasó anoche?'), say(`Anoche el guard dijo: "${REFUSAL}" — por eso el Agent no llegó a lanzarse, y la investigación va delegada.`)],
  ],
  [
    'two refusals, one retried: the one that was not is still owed',
    1,
    [...PROLOGUE, prompt('dos frentes'), agentCall('t1', 'Trace the missing row expander'), result('t1', REFUSAL, true), agentCall('t2', 'Close the 67 visual baselines'), result('t2', REFUSAL, true), agentCall('t3', 'Close the 67 visual baselines'), result('t3', LAUNCHED, false)],
  ],
  [
    'two refusals, both retried',
    0,
    [...PROLOGUE, prompt('dos frentes'), agentCall('t1', 'A'), result('t1', REFUSAL, true), agentCall('t2', 'B'), result('t2', REFUSAL, true), agentCall('t3', 'B'), result('t3', LAUNCHED, false), agentCall('t4', 'A'), result('t4', LAUNCHED, false)],
  ],
  [
    'a success BEFORE the refusal cannot be its retry',
    1,
    [...PROLOGUE, prompt('delega dos'), agentCall('t1', 'A'), result('t1', LAUNCHED, false), agentCall('t2', 'B'), result('t2', REFUSAL, true), say('ambos en marcha')],
  ],
  [
    'the refusal lives in an EARLIER turn and this turn is clean',
    0,
    [...PROLOGUE, prompt('primer turno'), agentCall('t1', 'A'), result('t1', REFUSAL, true), say('no pude'), prompt('segundo turno'), say('aquí no se delegó nada')],
  ],
  [
    'the refusal lives in an EARLIER turn and THIS turn retried it — still clean, and for the right reason',
    0,
    [...PROLOGUE, prompt('primer turno'), agentCall('t1', 'A'), result('t1', REFUSAL, true), prompt('segundo turno'), agentCall('t2', 'A'), result('t2', LAUNCHED, false)],
  ],
  [
    'a sub-agent refused inside its own sidechain: not this turn, not this guard',
    0,
    [
      ...PROLOGUE,
      prompt('haz algo'),
      { ...agentCall('t1', 'A'), isSidechain: true },
      { ...result('t1', REFUSAL, true), isSidechain: true },
      say('hecho'),
    ],
  ],
  [
    'an attempt whose result never arrived is unknowable, not a refusal',
    0,
    [...PROLOGUE, prompt('delega'), agentCall('t1', 'A')],
  ],
  [
    'an attempt with no result does not PAY an outstanding refusal either',
    1,
    [...PROLOGUE, prompt('delega'), agentCall('t1', 'A'), result('t1', REFUSAL, true), agentCall('t2', 'A')],
  ],
  [
    // MEASURED on the recorded transcripts: a result that went fine often carries no `is_error` key at
    // all rather than `false`. A reader that treats "not false" as a refusal would refuse every one of
    // those turns. @es MEDIDO: un resultado correcto a menudo no lleva `is_error`; leer «distinto de
    // false» como rechazo rechazaría todos esos turnos.
    'a success recorded with NO is_error field at all — the real shape — is still a launch',
    0,
    [...PROLOGUE, prompt('delega'), agentCall('t1', 'A'), result('t1', REFUSAL, true), agentCall('t2', 'A'), { type: 'user', timestamp: tick(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: LAUNCHED }] } }],
  ],
  [
    'a refusal on SendMessage counts exactly like one on Agent',
    1,
    [...PROLOGUE, prompt('reanuda'), resumeCall('t1', 'a42240d'), result('t1', 'BRIEF-PROVENANCE REFUSED this message (SendMessage): the brief has nowhere to tell a measured fact from a guess.', true)],
  ],
];

console.log('--- the decision\'s state space ---');

for (const [label, expected, entries] of cases) {
  const file = transcript(label, entries);
  const owed = owedBy(payloadFor(file, `s-${checks}`), path.join(SCRATCH, 'state-empty'));

  check(Array.isArray(owed) && owed.length === expected, `${label} -> owed ${Array.isArray(owed) ? owed.length : owed}, expected ${expected}`);
}

// The refusal must NAME the attempt that was not retried — a refusal you cannot act on gets routed
// around. @es El rechazo debe NOMBRAR el intento no reintentado.
{
  const [, , entries] = cases[6];
  const owed = owedBy(payloadFor(transcript('naming', entries), 's-naming'), path.join(SCRATCH, 'state-empty'));

  check(owed.length === 1 && owed[0].label.includes('Trace the missing row expander'), `the unretried attempt is named: ${owed[0]?.label}`);
  check(owed[0]?.reason?.includes('ORPHAN-WORK GUARD') === true, `and the refusal that produced it is quoted: ${owed[0]?.reason?.slice(0, 40)}`);
}

// --- THE RECORDED ESCAPE ----------------------------------------------------------------------------

console.log('\n--- the recorded escape ---');

{
  const entries = [...PROLOGUE, prompt('investiga'), agentCall('t1', 'Trace the missing row expander'), result('t1', REFUSAL, true), say('lo dejo estar')];
  const file = transcript('abandoned', entries);
  const refusedAt = entries[4].timestamp;
  const store = path.join(SCRATCH, 'state-abandon');

  mkdirSync(store, { recursive: true });

  const after = new Date(Date.parse(refusedAt) + 60_000).toISOString();
  const before = new Date(Date.parse(refusedAt) - 60_000).toISOString();

  recordAbandonment({ session: 'other-session', reason: 'a reason belonging to a different session entirely', at: after }, store);
  check(owedBy(payloadFor(file, 's-abandon'), store).length === 1, 'an abandonment recorded by ANOTHER session pays nothing');

  recordAbandonment({ session: 's-abandon', reason: 'recorded before the refusal even happened, so it cannot answer it', at: before }, store);
  check(owedBy(payloadFor(file, 's-abandon'), store).length === 1, 'an abandonment recorded BEFORE the refusal pays nothing');

  recordAbandonment({ session: 's-abandon', reason: 'the orphan work is somebody else\'s and must not be disturbed', at: after }, store);
  check(owedBy(payloadFor(file, 's-abandon'), store).length === 0, 'an abandonment recorded AFTER the refusal, in this session, pays it');
}

{
  // The CLI is the only door, and it refuses an escape with nothing written in it.
  // @es El CLI es la única puerta y rechaza una salida sin nada escrito.
  const cli = path.join(HERE, 'abandon.mjs');
  const thin = spawnSync(process.execPath, [cli, '--session', 's-cli', '--reason', 'n/a'], { encoding: 'utf8' });

  check(thin.status === 2, 'the escape CLI refuses a reason that says nothing');

  const none = spawnSync(process.execPath, [cli, '--reason', 'a perfectly good reason that is long enough'], { encoding: 'utf8' });

  check(none.status === 2, 'the escape CLI refuses without a session');
}

// --- MULTI-BYTE, the same byte size in two alphabets -------------------------------------------------

console.log('\n--- multi-byte content larger than the sliced window ---');

{
  const PAD_BYTES = 2_600_000;
  const ascii = 'x'.repeat(PAD_BYTES);
  // Two bytes per character in UTF-8, so the same BYTE size carries half the characters.
  const accented = 'é'.repeat(PAD_BYTES / 2);

  const verdicts = [];

  for (const [name, padding] of [['ascii', ascii], ['multibyte', accented]]) {
    const entries = [...PROLOGUE, prompt('investiga'), agentCall('t1', 'Trace the missing row expander'), result('t1', REFUSAL, true), result('pad', padding, false), say('va delegado')];
    const file = transcript(`window-${name}`, entries);

    verdicts.push(owedBy(payloadFor(file, `s-${name}`), path.join(SCRATCH, 'state-empty'))?.length);
  }

  check(verdicts[0] === 1, `the ASCII twin, padded past the first window, still sees the refusal (owed ${verdicts[0]})`);
  check(verdicts[1] === 1, `the multi-byte twin of the same BYTE size gives the same verdict (owed ${verdicts[1]})`);
  check(verdicts[0] === verdicts[1], 'both alphabets agree');

  // The turn sits at the TAIL, behind more than a window of older traffic — which is what every real
  // transcript looks like. The cases above pad AFTER the boundary and so would be answered correctly by
  // a reader that took the HEAD of the file; this one would not, and that is the point of it.
  // @es El turno está en la COLA, detrás de más de una ventana de tráfico viejo — como cualquier
  // transcript real. Los casos anteriores rellenan DESPUÉS de la frontera y los respondería igual un
  // lector que cogiera la CABECERA del fichero; este no.
  for (const [name, padding] of [['ascii', ascii], ['multibyte', accented]]) {
    const entries = [prompt('an earlier question'), result('pad', padding, false), say('an earlier answer'), prompt('investiga el gate'), agentCall('t1', 'Trace the missing row expander'), result('t1', REFUSAL, true), say('va delegado')];
    const file = transcript(`behind-${name}`, entries);
    const owed = owedBy(payloadFor(file, `s-behind-${name}`), path.join(SCRATCH, 'state-empty'));

    check(owed?.length === 1, `the ${name} turn is found at the tail, behind ${PAD_BYTES} bytes of older traffic (owed ${owed?.length})`);
  }
}

// --- MALFUNCTION: every one of them ALLOWS ------------------------------------------------------------

console.log('\n--- malfunction paths all allow ---');

{
  const missing = path.join(SCRATCH, 'does-not-exist.jsonl');

  check(owedBy(payloadFor(missing, 's-missing'), SCRATCH) === undefined, 'a transcript that does not exist is unknowable, never clean');
  check(owedBy({ session_id: 's-nopath' }, SCRATCH) === undefined, 'a payload with no transcript_path is unknowable');
  check(owedBy({}, SCRATCH) === undefined, 'an empty payload is unknowable');

  const garbage = path.join(SCRATCH, 'garbage.jsonl');

  writeFileSync(garbage, 'this is not JSON\nneither is this\n', 'utf8');
  check(owedBy(payloadFor(garbage, 's-garbage'), SCRATCH) === undefined, 'a transcript that will not parse is unknowable');

  const boundaryless = transcript('boundaryless', [say('no user entry anywhere'), agentCall('t1', 'A'), result('t1', REFUSAL, true)]);

  check(owedBy(payloadFor(boundaryless, 's-noboundary'), SCRATCH) === undefined, 'a transcript with no turn boundary is unknowable, never clean');
}

// --- THE HOOK, end to end, driven exactly as the harness drives it -----------------------------------

console.log('\n--- the hook, through its real command line ---');

// The hook speaks JSON on stdout, so the assertions read the PARSED reason rather than the raw text:
// a check against the raw stream tests JSON escaping, not what the reader will be shown.
// @es El hook habla JSON; se comprueba el motivo YA PARSEADO, no el texto crudo (eso probaría el
// escapado JSON, no lo que verá quien lo lea).
const drive = (payload) => {
  const run = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: 'utf8' });
  let decision;

  try {
    decision = JSON.parse(run.stdout);
  } catch {
    decision = undefined;
  }

  return { status: run.status, blocked: decision?.decision === 'block', reason: decision?.reason ?? '', stdout: run.stdout };
};

{
  const unretried = transcript('e2e-refuse', [...PROLOGUE, prompt('investiga el gate'), agentCall('t1', 'Trace the missing row expander'), result('t1', REFUSAL, true), say('va delegado con las dos hipótesis separadas')]);
  const retried = transcript('e2e-allow', [...PROLOGUE, prompt('investiga el gate'), agentCall('t1', 'Trace the missing row expander'), result('t1', REFUSAL, true), agentCall('t2', 'Trace the missing row expander'), result('t2', LAUNCHED, false)]);

  const refused = drive(payloadFor(unretried, `selftest-refuse-${process.pid}`));

  check(refused.status === 0, 'the hook always exits 0, block or not');
  check(refused.blocked, 'a real-shaped payload over an unretried refusal BLOCKS');
  check(refused.reason.includes('Trace the missing row expander'), 'and the block names the attempt');
  check(refused.reason.includes('abandon.mjs') && refused.reason.includes('--reason'), 'and prints the runnable abandonment command');
  check(refused.reason.includes('ORPHAN-WORK GUARD'), 'and quotes the refusal the reader has to act on');

  const allowed = drive(payloadFor(retried, `selftest-allow-${process.pid}`));

  check(allowed.status === 0 && !allowed.blocked && allowed.stdout.trim().length === 0, 'a real-shaped payload over a retried refusal is SILENT');

  const bounded = drive(payloadFor(unretried, `selftest-bound-${process.pid}`, { stop_hook_active: true }));

  check(!bounded.blocked, 'stop_hook_active allows: the obligation is raised once, never twice');

  const session = `selftest-cooldown-${process.pid}`;

  check(drive(payloadFor(unretried, session)).blocked, 'the first stop of a session blocks');
  check(!drive(payloadFor(unretried, session)).blocked, 'the cooldown suppresses an immediate second block, independently of stop_hook_active');

  const broken = spawnSync(process.execPath, [GUARD], { input: 'not json at all', encoding: 'utf8' });

  check(broken.status === 0 && !broken.stdout.includes('block'), 'an unparseable payload allows');

  const bom = spawnSync(process.execPath, [GUARD], { input: `﻿${JSON.stringify(payloadFor(unretried, `selftest-bom-${process.pid}`))}`, encoding: 'utf8' });

  check(bom.blocked !== true && bom.status === 0, 'a BOM-prefixed payload is decoded, not silently swallowed');
  check(bom.stdout.includes('"decision":"block"'), 'and it reaches the same verdict as the un-prefixed one');
}

rmSync(SCRATCH, { recursive: true, force: true });

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures === 0 ? 0 : 1);
