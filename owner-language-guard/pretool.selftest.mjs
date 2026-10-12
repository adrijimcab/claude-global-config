#!/usr/bin/env node
/**
 * Discrimination proof of the PreToolUse language guard over a CONSTRUCTED state space (temp transcripts,
 * never a live one): English interstitial, Spanish, Spanish with technical terms and code, quoted English,
 * nothing since the last tool, subagent caller, unreadable transcript, the one-English-word near miss,
 * plus the window growth over a transcript larger than the initial read and the process shell.
 * @es Prueba de discriminación del guard de idioma en PreToolUse sobre estados CONSTRUIDOS (transcripts
 * temporales, nunca uno vivo).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync as readText, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isolateState, stateDir } from '../hook-state/locations.mjs';

isolateState('owner-language-guard');

const { evaluate } = await import('./pretool.mjs');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'pretool-lang-'));
const results = [];

function check(name, actual, expected) {
  const ok = actual === expected;

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${expected}, got ${actual}`}`);
}

const text = (t) => ({ type: 'text', text: t });
const toolUse = (input) => ({ type: 'tool_use', id: 't1', name: 'Bash', input });
const assistant = (content, extra = {}) => JSON.stringify({ type: 'assistant', message: { content }, ...extra });
const user = (t) => JSON.stringify({ type: 'user', message: { content: t } });
const toolResult = (t) => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: t }] } });

const ENGLISH = 'Now the spec revision, resume the spec agent with the new findings.';
const SPANISH = 'Listo, ahora corro la revisión de la spec y retomo al agente con los hallazgos nuevos.';
const SPANISH_TECH = 'Hice el commit en el worktree, corrí el selftest y el gate del pipeline quedó en verde; `git status` limpio.';
const SPANISH_QUOTED = 'El agente respondió textualmente: "Now the spec revision is ready for the review" y sigo con eso.';
const NEAR_MISS = 'Listo, ahora corro el selftest del guard y después te cuento cómo salió todo, ok.';

let n = 0;

function transcript(lines, directory = scratch) {
  n += 1;
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `t${n}.jsonl`);

  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');

  return file;
}

const call = (file, extra = {}) => evaluate(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', transcript_path: file, ...extra }));
const reasonOf = (output) => output?.hookSpecificOutput?.permissionDecisionReason ?? '';
const denied = (output) => output?.hookSpecificOutput?.permissionDecision === 'deny';
const step = (t) => [user('Dale'), assistant([text('Va.'), toolUse({})]), toolResult('ok'), assistant([text(t), toolUse({ command: 'ls' })])];

try {
  const refusal = call(transcript(step(ENGLISH)));

  check('English interstitial is refused', denied(refusal), true);
  check('refusal is bilingual (English then @es)', /^OWNER LANGUAGE GUARD.* @es GUARD DE IDIOMA/s.test(reasonOf(refusal)), true);
  check('refusal quotes the offending excerpt', reasonOf(refusal).includes('spec revision'), true);
  check('refusal asks for Rioplatense Spanish', reasonOf(refusal).includes('Rioplatense Spanish') && reasonOf(refusal).includes('español rioplatense'), true);
  check('refusal names the PreToolUse event', refusal?.hookSpecificOutput?.hookEventName, 'PreToolUse');
  check('Spanish prose is allowed', denied(call(transcript(step(SPANISH)))), false);
  check('Spanish with technical terms and code is allowed', denied(call(transcript(step(SPANISH_TECH)))), false);
  check('quoted English inside Spanish is allowed', denied(call(transcript(step(SPANISH_QUOTED)))), false);
  check('the near miss (one English word in Spanish) is allowed', denied(call(transcript(step(NEAR_MISS)))), false);
  check('English inside a code block is allowed', denied(call(transcript(step('Corro esto:\n```\nNow the spec revision, resume the spec agent.\n```')))), false);
  check('no text since the last tool result is allowed', denied(call(transcript([user('Dale'), assistant([text(ENGLISH), toolUse({})]), toolResult('ok'), assistant([toolUse({})])]))), false);
  check('English text BEFORE the last tool result is not judged again', denied(call(transcript([user('Dale'), assistant([text(ENGLISH), toolUse({})]), toolResult('ok'), assistant([text(SPANISH), toolUse({})])]))), false);
  check('English inside the tool call input is never judged', denied(call(transcript([user('Dale'), assistant([text(SPANISH), toolUse({ command: `echo ${ENGLISH}` })])]))), false);
  check('English written before the first tool of a turn is refused', denied(call(transcript([user('Dale'), assistant([text(ENGLISH), toolUse({})])]))), true);
  check('two assistant entries: the English one is found', denied(call(transcript([user('Dale'), assistant([text(SPANISH)]), assistant([text(ENGLISH), toolUse({})])]))), true);
  check('sidechain traffic is not judged', denied(call(transcript([user('Dale'), assistant([text(ENGLISH), toolUse({})], { isSidechain: true })]))), false);
  check('subagent caller (agent_id) is never judged', denied(call(transcript(step(ENGLISH)), { agent_id: 'a1b2' })), false);
  check('subagent caller (transcript under subagents/) is never judged', denied(call(transcript(step(ENGLISH), path.join(scratch, 'subagents')))), false);
  check('missing transcript is allowed', denied(call(path.join(scratch, 'nope.jsonl'))), false);
  check('payload without transcript_path is allowed', denied(call(undefined)), false);
  check('an empty transcript_path never reaches the reader', evaluate(JSON.stringify({ transcript_path: '' }), () => [ENGLISH]), undefined);
  check('garbage payload is allowed', evaluate('{not json'), undefined);
  check('BOM payload is parsed', denied(evaluate(`﻿${JSON.stringify({ transcript_path: transcript(step(ENGLISH)) })}`)), true);
  check('a reader that throws is allowed', evaluate(JSON.stringify({ transcript_path: 'x' }), () => { throw new Error('boom'); }), undefined);

  // The shape MEASURED in a real session (c4d7f854, 2026-10-11): after the previous tool result come
  // bookkeeping records (attachment), then the text record, and the first tool_use of the response is a
  // SEPARATE later record carrying wireToolInputs. The English line preceded an Edit call.
  // @es La forma MEDIDA en una sesión real: tras el tool_result vienen registros de contabilidad
  // (attachment), luego el texto, y el primer tool_use de la respuesta es un registro posterior APARTE.
  const attachment = (type) => JSON.stringify({ type: 'attachment', attachment: { type } });
  const realShape = (t) => [user('Dale'), assistant([text('Va.'), toolUse({})]), toolResult('ok'), attachment('total_tokens_reminder'), attachment('output_style'), assistant([text(t)], { requestId: 'req_x', slug: 's' }), JSON.stringify({ type: 'assistant', wireToolInputs: { t: { file_path: 'x' } }, message: { content: [{ type: 'tool_use', id: 't', name: 'Edit', input: { file_path: 'x' } }] } })];
  const editCall = (file) => evaluate(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', transcript_path: file, tool_input: { file_path: 'x' } }));

  check('real shape: English before the first Edit of a response is refused', denied(editCall(transcript(realShape('Now the backlog correction for the ApexCharts mistake, and the lesson capture.')))), true);
  check('real shape: Spanish before the first Edit of a response is allowed', denied(editCall(transcript(realShape(SPANISH)))), false);
  check('real shape: a bookkeeping record between the text and the tool_use does not hide the text', denied(editCall(transcript([...realShape(ENGLISH).slice(0, -1), attachment('output_style'), realShape(ENGLISH).at(-1)]))), true);
  check('real shape: the text record alone (tool_use not yet written) is judged', denied(editCall(transcript(realShape(ENGLISH).slice(0, -1)))), true);

  // A tool result larger than the initial window sits between the previous step and the new text.
  const big = 'x'.repeat(600 * 1024);

  check('window grows past a large tool result and finds the English line', denied(call(transcript([user('Dale'), assistant([text(SPANISH), toolUse({})]), toolResult(big), assistant([text(ENGLISH), toolUse({})])]))), true);
  check('window grows past a large tool result and allows Spanish', denied(call(transcript([user('Dale'), assistant([text(ENGLISH), toolUse({})]), toolResult(big), assistant([text(SPANISH), toolUse({})])]))), false);
  check('no user entry within the ceiling is allowed (age unknown)', denied(call(transcript([user('Dale'), ...Array.from({ length: 4 }, () => assistant([text(`${ENGLISH} `.repeat(45000))]))]))), false);
  check('a transcript with no user entry at all is judged from its start', denied(call(transcript([assistant([text(ENGLISH), toolUse({})])]))), true);
  check('a sidechain user entry does not close the step', denied(call(transcript([user('Dale'), assistant([text(ENGLISH), toolUse({})]), JSON.stringify({ type: 'user', isSidechain: true, message: { content: 'x' } }), assistant([text(SPANISH), toolUse({})])]))), true);
  const twoEnglish = call(transcript([user('Dale'), assistant([text('First the alpha review, then the beta review follows now.')]), assistant([text('Later the gamma review, then the delta review follows now.'), toolUse({})])]));

  check('the first English line written is the one quoted', reasonOf(twoEnglish).includes('alpha review') && !reasonOf(twoEnglish).includes('gamma review'), true);
  check('window grows past a 2 MB tool result and finds the English line', denied(call(transcript([user('Dale'), assistant([text(SPANISH), toolUse({})]), toolResult('x'.repeat(2 << 20)), assistant([text(ENGLISH), toolUse({})])]))), true);

  // The race MEASURED live on 2026-10-12 (Claude Code 2.1.296, owner-language-guard/fixtures/pretool-lag-probe.jsonl):
  // the transcript is written asynchronously, so when PreToolUse fires the text record and the tool_use record of
  // THIS call are often not on disk yet (3 of 4 calls in the probe). The guard anchors on the payload's tool_use_id,
  // waits (bounded) until that record is written, and judges the texts BEFORE it.
  // @es La carrera MEDIDA en vivo: el transcript se escribe de forma asíncrona, así que al disparar PreToolUse el
  // texto y el tool_use de ESTA llamada suelen no estar aún en disco (3 de 4 en la sonda). El guard se ancla en el
  // tool_use_id del payload, espera (acotado) a que ese registro exista y juzga los textos ANTERIORES.
  const toolUseAs = (id, input = {}) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Bash', input }] } });
  const textRecord = (t) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
  const anchoredCall = (file, id, readTexts) => evaluate(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: id, transcript_path: file }), readTexts);
  const { appendFileSync: appendText } = await import('node:fs');
  const { readInterstitialTexts, sleepSync } = await import('./interstitial.mjs');
  const laggedBase = () => [user('Dale'), assistant([text('Va.'), toolUse({})]), toolResult('ok'), attachment('total_tokens_reminder'), attachment('output_style')];
  const waitingFor = (file, late, { timeoutMs = 2000 } = {}) => {
    let sleeps = 0;
    let clock = 0;
    const wait = { timeoutMs, pollMs: 25, now: () => clock, sleep: (ms) => { sleeps += 1; clock += ms; if (sleeps > 1000) throw new Error('runaway wait'); if (sleeps === 2) appendText(file, late.map((line) => `${line}
`).join('')); } };

    return { read: (transcriptPath, id) => readInterstitialTexts(transcriptPath, id, wait), sleeps: () => sleeps };
  };

  const lagFile = transcript(laggedBase());
  const lagged = waitingFor(lagFile, [textRecord(ENGLISH), toolUseAs('toolu_lag')]);

  check('lag: English text that lands after the hook started is refused', denied(anchoredCall(lagFile, 'toolu_lag', lagged.read)), true);
  check('lag: the guard waited for the record instead of judging an empty tail', lagged.sleeps() >= 2, true);

  const lagSpanishFile = transcript(laggedBase());
  const laggedSpanish = waitingFor(lagSpanishFile, [textRecord(SPANISH), toolUseAs('toolu_es')]);

  check('lag: Spanish text that lands late is allowed', denied(anchoredCall(lagSpanishFile, 'toolu_es', laggedSpanish.read)), false);

  const presentFile = transcript([...laggedBase(), textRecord(ENGLISH), toolUseAs('toolu_now')]);
  const present = waitingFor(presentFile, []);

  check('anchored: a record already on disk is judged without waiting', denied(anchoredCall(presentFile, 'toolu_now', present.read)), true);
  check('anchored: no sleep when the record is already there', present.sleeps(), 0);

  const afterFile = transcript([...laggedBase(), textRecord(SPANISH), toolUseAs('toolu_a'), toolResult('ok'), textRecord(ENGLISH), toolUseAs('toolu_b')]);

  check('anchored: English written AFTER the anchored call is not judged for it', denied(anchoredCall(afterFile, 'toolu_a', waitingFor(afterFile, []).read)), false);
  check('anchored: the later call judges its own English', denied(anchoredCall(afterFile, 'toolu_b', waitingFor(afterFile, []).read)), true);

  const priorFile = transcript([...laggedBase(), textRecord(ENGLISH), toolUseAs('toolu_first'), toolResult('ok'), toolUseAs('toolu_second')]);

  check('anchored: the call right after a tool result does not re-judge the earlier text', denied(anchoredCall(priorFile, 'toolu_second', waitingFor(priorFile, []).read)), false);

  const parallelFile = transcript([...laggedBase(), textRecord(ENGLISH), toolUseAs('toolu_p1'), toolUseAs('toolu_p2')]);

  check('anchored: the second call of a parallel batch still sees the text before the first', denied(anchoredCall(parallelFile, 'toolu_p2', waitingFor(parallelFile, []).read)), true);

  const neverFile = transcript([...laggedBase(), textRecord(ENGLISH)]);
  const never = waitingFor(neverFile, [], { timeoutMs: 100 });

  check('timeout: an anchor that never lands falls back to the text already on disk', denied(anchoredCall(neverFile, 'toolu_never', never.read)), true);
  check('timeout: the wait is bounded by the budget (100 ms / 25 ms = 4 sleeps)', never.sleeps(), 4);

  const silentFile = transcript(laggedBase());

  check('timeout: nothing on disk and nothing arriving is allowed', denied(anchoredCall(silentFile, 'toolu_none', waitingFor(silentFile, [], { timeoutMs: 100 }).read)), false);
  check('a payload without tool_use_id keeps the unanchored behaviour', denied(call(transcript(step(ENGLISH)))), true);

  const realSleepFile = transcript([...laggedBase(), textRecord(ENGLISH)]);
  const started = Date.now();

  readInterstitialTexts(realSleepFile, 'toolu_real_sleep', { timeoutMs: 150, pollMs: 25 });
  const cpuBefore = process.cpuUsage();
  const sleepStart = Date.now();

  sleepSync(120);

  const cpuMs = (process.cpuUsage(cpuBefore).user + process.cpuUsage(cpuBefore).system) / 1000;

  check('sleepSync blocks for the requested time', Date.now() - sleepStart >= 110, true);
  check('sleepSync waits without spinning the CPU', cpuMs < 60, true);

  let seenId = 'unset';

  anchoredCall(transcript(step(SPANISH)), '', (_file, id) => { seenId = id; return []; });
  check('an empty tool_use_id is not taken as an anchor', seenId, undefined);
  check('a string tool_use_id reaches the reader as is', (() => { let got; anchoredCall(transcript(step(SPANISH)), 'toolu_x', (_f, id) => { got = id; return []; }); return got; })(), 'toolu_x');
  check('the default sleep really waits (>= 150 ms) and stays bounded (< 2 s)', Date.now() - started >= 150 && Date.now() - started < 2000, true);

  // The two REAL slips of 2026-10-12 (orchestrator session 5f411d3c, entries trimmed): each window ends at the
  // tool_use record of the call the guard let through. Replayed whole, and replayed as the lag left it: the text
  // and tool_use records not yet on disk when the hook starts.
  // @es Los dos deslices REALES: cada ventana termina en el tool_use de la llamada que el guard dejó pasar.
  // Reproducidos enteros y como los dejó el retraso: texto y tool_use aún no escritos al arrancar el hook.
  const { readFileSync: readFixture } = await import('node:fs');
  const realWindows = [
    ['Read after "Now the backlog correction on checkpoint-24."', 'real-slip-read-2026-10-12.jsonl', 'toolu_013ouYwZqP2dQ7CjrVdsWqKQ', 'backlog correction'],
    ['Bash after "Now the backlog record for those two..."', 'real-slip-bash-2026-10-12.jsonl', 'toolu_01A7BDqa8hsPz76tBEiHAmqq', 'backlog record']
  ];

  for (const [label, name, id, excerpt] of realWindows) {
    const lines = readFixture(path.join(import.meta.dirname, 'fixtures', name), 'utf8').split('\n').filter(Boolean);
    const whole = transcript(lines);
    const refusedWhole = anchoredCall(whole, id, waitingFor(whole, []).read);

    check(`real slip, whole window: ${label} is refused`, denied(refusedWhole) && reasonOf(refusedWhole).includes(excerpt), true);

    const lagFixture = transcript(lines.slice(0, -2));
    const laggedReal = waitingFor(lagFixture, lines.slice(-2));

    check(`real slip, lagged window: ${label} is refused after the records land`, denied(anchoredCall(lagFixture, id, laggedReal.read)), true);
    check(`real slip, lagged window: ${label} was waited for`, laggedReal.sleeps() >= 2, true);
  }

  // The trace of the last run (2026-10-12): the guard FAILS OPEN on every problem of its own, so a third English line
  // reached the owner with no way to tell whether the hook ran, skipped the call as a subagent's, or judged nothing.
  // Every run now overwrites one small record; the next miss is read from it. A failing write never changes the verdict.
  // @es La traza de la última corrida: el guard FALLA ABIERTO ante todo problema propio, así que una tercera línea en
  // inglés llegó al dueño sin poder saber si el hook corrió, saltó la llamada por ser de un subagente o no juzgó nada.
  // Cada corrida sobrescribe un registro pequeño; el próximo fallo se lee de él. Una escritura fallida no cambia el veredicto.
  const lastRunFile = path.join(stateDir('owner-language-guard'), 'pretool-last-run.json');
  const lastRun = () => { try { return JSON.parse(readText(lastRunFile, 'utf8')); } catch (error) { return { verdict: `unreadable: ${error.message}` }; } };
  const traced = (payload, readTexts) => { evaluate(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'mcp__engram__mem_save', ...payload }), readTexts); return lastRun(); };
  const tracedFile = transcript(step(ENGLISH));

  check('trace: a refusal is recorded as deny with the tool and its id', (() => { const r = traced({ tool_use_id: 'toolu_trace', transcript_path: tracedFile }); return `${r.verdict}|${r.toolName}|${r.toolUseId}|${r.judged}`; })(), 'deny|mcp__engram__mem_save|toolu_trace|1');
  check('trace: the transcript path the harness gave is recorded', traced({ tool_use_id: 'toolu_p', transcript_path: tracedFile }).transcriptPath, tracedFile);
  check('trace: an allow is recorded as allow', traced({ tool_use_id: 'toolu_a', transcript_path: transcript(step(SPANISH)) }).verdict, 'allow');
  check('trace: a subagent caller is recorded as skipped:subagent', traced({ agent_id: 'a1', transcript_path: tracedFile }).verdict, 'skipped:subagent');
  check('trace: the subagent skip records which signal fired', (() => { const r = traced({ agent_id: 'a1', transcript_path: tracedFile }); return `${r.hasAgentId}|${r.underSubagentDirectory}`; })(), 'true|false');
  check('trace: a transcript under subagents/ without agent_id records that signal alone', (() => { const r = traced({ transcript_path: path.join(scratch, 'subagents', 'agent-x.jsonl') }); return `${r.verdict}|${r.hasAgentId}|${r.underSubagentDirectory}`; })(), 'skipped:subagent|false|true');
  check('trace: a payload without transcript_path is recorded as skipped:no-transcript', traced({}).verdict, 'skipped:no-transcript');
  check('trace: a reader that throws is recorded as error with its message', (() => { const r = traced({ transcript_path: tracedFile }, () => { throw new Error('boom'); }); return `${r.verdict}|${r.error}`; })(), 'error|boom');
  check('trace: unparsable payloads are recorded as error', (() => { evaluate('{not json'); return lastRun().verdict; })(), 'error');
  check('trace: the elapsed time is recorded', typeof traced({ tool_use_id: 'toolu_ms', transcript_path: tracedFile }).ms, 'number');
  check('trace: a run overwrites the previous record', traced({ tool_use_id: 'toolu_second', transcript_path: tracedFile }).toolUseId, 'toolu_second');

  const blocked = path.join(scratch, 'state-is-a-file');

  writeFileSync(blocked, 'x');
  process.env.HOOK_STATE_DIR = blocked;
  check('trace: a state directory that cannot be written never changes the verdict', denied(call(tracedFile)), true);
  process.env.HOOK_STATE_DIR = path.dirname(path.dirname(lastRunFile));

  const cli = (input) => spawnSync(process.execPath, [path.join(import.meta.dirname, 'pretool.mjs')], { input, encoding: 'utf8' });
  const cliEnglish = cli(JSON.stringify({ transcript_path: transcript(step(ENGLISH)) }));

  check('cli: English exits 0', cliEnglish.status, 0);
  check('cli: English prints a deny', JSON.parse(cliEnglish.stdout || '{}').hookSpecificOutput?.permissionDecision, 'deny');
  check('cli: broken payload prints nothing', cli('{x').stdout, '');
  check('cli: Spanish prints nothing', cli(JSON.stringify({ transcript_path: transcript(step(SPANISH)) })).stdout, '');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
