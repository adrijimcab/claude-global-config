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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { evaluate } from './pretool.mjs';

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
