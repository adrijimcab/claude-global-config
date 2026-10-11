#!/usr/bin/env node
/**
 * Discrimination proof of the stale-session warning over a CONSTRUCTED state space (a temp Claude home, a temp
 * state root, temp transcripts, never a live one): a session whose baseline predates a registered hook group is
 * warned once; a session that started after the change stays silent; and the edge cases (first prompt, missing
 * transcript, unreadable or absent settings, manifest edits, resume, subagent caller, broken payload, the CLI).
 * @es Prueba de discriminación del aviso de sesión desactualizada sobre estados CONSTRUIDOS (home de Claude,
 * raíz de estado y transcripts temporales, nunca los vivos): una sesión cuya línea base es anterior a un grupo
 * de hooks registrado se avisa una vez; una que arrancó después queda en silencio; y los casos borde.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isolateState } from '../hook-state/locations.mjs';
import { evaluate } from './prompt-hook.mjs';

isolateState('stale-session-guard');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'stale-session-'));
const results = [];

function check(name, actual, expected) {
  const ok = actual === expected;

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${expected}, got ${actual}`}`);
}

let counter = 0;
const fresh = () => {
  counter += 1;

  return path.join(scratch, `case${counter}`);
};

const dispatchCommand = (manifest) => `node "$HOME/.claude/hook-dispatch/dispatch.mjs" "$HOME/.claude/hook-dispatch/manifests/${manifest}.json"`;
const group = (matcher, command) => ({ matcher, hooks: [{ type: 'command', command }] });

const BASE_HOOKS = { PreToolUse: [group('Bash', dispatchCommand('pretooluse-shell'))], Stop: [group('', dispatchCommand('stop'))] };
const LANGUAGE = group('', dispatchCommand('pretooluse-language'));
const WITH_LANGUAGE = { ...BASE_HOOKS, PreToolUse: [...BASE_HOOKS.PreToolUse, LANGUAGE] };
const POST_SHELL = group('Bash', dispatchCommand('posttooluse-shell'));

const DEFAULT_MANIFESTS = {
  'pretooluse-language': ['../../owner-language-guard/pretool.mjs'],
  'pretooluse-shell': ['../../exit-code-guard/guard.mjs'],
  stop: ['../../hooks/claim-guard.mjs']
};

function makeHome(hooks, manifests = DEFAULT_MANIFESTS) {
  const home = fresh();

  mkdirSync(path.join(home, 'hook-dispatch', 'manifests'), { recursive: true });
  writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ hooks }), 'utf8');

  for (const [name, guards] of Object.entries(manifests)) writeFileSync(path.join(home, 'hook-dispatch', 'manifests', `${name}.json`), JSON.stringify({ event: 'PreToolUse', guards }), 'utf8');

  return home;
}

const setHooks = (home, hooks) => writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ hooks }), 'utf8');
const startRecord = (hookName, timestamp) => JSON.stringify({ type: 'attachment', timestamp, attachment: { type: 'hook_success', hookName, hookEvent: 'SessionStart' } });

function transcript(lines = [startRecord('SessionStart:startup', '2026-10-11T10:00:00.000Z')]) {
  const file = `${fresh()}.jsonl`;

  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');

  return file;
}

let sessions = 0;
const newSession = () => {
  sessions += 1;

  return `s-${sessions}`;
};

const prompt = (home, sessionId, file, extra = {}) =>
  evaluate(JSON.stringify({ session_id: sessionId, transcript_path: file, hook_event_name: 'UserPromptSubmit', prompt: 'hola', ...extra }), { home });
const contextOf = (output) => output?.hookSpecificOutput?.additionalContext ?? '';

try {
  // The reproduced miss: the session starts, the language group is registered later, the next prompt must say so.
  {
    const home = makeHome(BASE_HOOKS);
    const id = newSession();
    const file = transcript();

    check('first prompt of a session records the baseline and stays silent', prompt(home, id, file), undefined);
    check('a second prompt with nothing changed stays silent', prompt(home, id, file), undefined);

    setHooks(home, WITH_LANGUAGE);
    const warned = prompt(home, id, file);
    const text = contextOf(warned);

    check('a group registered after the session started produces the notice', text.length > 0, true);
    check('the notice names the event of the hook output', warned?.hookSpecificOutput?.hookEventName, 'UserPromptSubmit');
    check('the notice is bilingual (English first, then @es)', /^STALE SESSION.* @es SESIÓN DESACTUALIZADA/s.test(text), true);
    check('the notice names the guard the session lacks, without relative climbs', text.includes('owner-language-guard/pretool.mjs') && !text.includes('../'), true);
    check('the notice names the group registration', text.includes('PreToolUse') && text.includes('pretooluse-language'), true);
    check('the notice does not name a group the session has', text.includes('exit-code-guard'), false);
    check('the notice tells the session to restart', text.includes('Restart') && text.includes('Reiniciá'), true);
    check('the notice never blocks the prompt', warned !== undefined && !JSON.stringify(warned).includes('decision') && !JSON.stringify(warned).includes('block'), true);
    check('the same change is warned only once', prompt(home, id, file), undefined);

    setHooks(home, { ...WITH_LANGUAGE, PostToolUse: [POST_SHELL] });
    const second = contextOf(prompt(home, id, file));

    check('a further change warns again', second.length > 0, true);
    check('the further warning lists everything the session lacks', second.includes('pretooluse-language') && second.includes('posttooluse-shell'), true);
    check('the further change is also warned only once', prompt(home, id, file), undefined);
  }

  // The session that started AFTER the change is silent.
  {
    const home = makeHome(WITH_LANGUAGE);
    const file = transcript();

    check('a session that started after the change stays silent (first prompt)', prompt(home, newSession(), file), undefined);
    const id = newSession();

    prompt(home, id, file);
    check('a session that started after the change stays silent (later prompt)', prompt(home, id, file), undefined);
  }

  // Sessions are independent: one recorded its baseline before the change, another after.
  {
    const home = makeHome(BASE_HOOKS);
    const old = newSession();
    const file = transcript();

    prompt(home, old, file);
    setHooks(home, WITH_LANGUAGE);
    const young = newSession();

    prompt(home, young, file);
    check('the younger session is silent', prompt(home, young, file), undefined);
    check('the older session is warned', contextOf(prompt(home, old, file)).length > 0, true);
  }

  // An edit that the live process needs no restart for is not a staleness: a manifest is read on every call.
  {
    const home = makeHome(BASE_HOOKS);
    const id = newSession();
    const file = transcript();

    prompt(home, id, file);
    writeFileSync(path.join(home, 'hook-dispatch', 'manifests', 'stop.json'), JSON.stringify({ event: 'Stop', guards: ['../../hooks/claim-guard.mjs', '../../stash-watch/guard.mjs'] }), 'utf8');
    check('a guard added to an existing manifest is live, so no notice', prompt(home, id, file), undefined);
  }

  // A removed group is not a missing guard.
  {
    const home = makeHome(WITH_LANGUAGE);
    const id = newSession();
    const file = transcript();

    prompt(home, id, file);
    setHooks(home, BASE_HOOKS);
    check('a group removed after the start is not a lack', prompt(home, id, file), undefined);
  }

  // A restart of the process under the same session id (resume) reloads the configuration: re-baseline, no notice.
  {
    const home = makeHome(BASE_HOOKS);
    const id = newSession();
    const file = transcript([startRecord('SessionStart:startup', '2026-10-11T10:00:00.000Z')]);

    prompt(home, id, file);
    setHooks(home, WITH_LANGUAGE);
    writeFileSync(file, `${startRecord('SessionStart:startup', '2026-10-11T10:00:00.000Z')}\n${startRecord('SessionStart:resume', '2026-10-11T12:00:00.000Z')}\n`, 'utf8');
    check('a resumed process (newer SessionStart) re-baselines silently', prompt(home, id, file), undefined);
    setHooks(home, { ...WITH_LANGUAGE, PostToolUse: [POST_SHELL] });
    check('and a change after the resume is warned', contextOf(prompt(home, id, file)).length > 0, true);

    const home2 = makeHome(BASE_HOOKS);
    const id2 = newSession();
    const file2 = transcript([startRecord('SessionStart:startup', '2026-10-11T10:00:00.000Z')]);

    prompt(home2, id2, file2);
    setHooks(home2, WITH_LANGUAGE);
    writeFileSync(file2, `${startRecord('SessionStart:startup', '2026-10-11T10:00:00.000Z')}\n${startRecord('SessionStart:compact', '2026-10-11T12:00:00.000Z')}\n`, 'utf8');
    check('a compaction (SessionStart:compact) does not re-baseline', contextOf(prompt(home2, id2, file2)).length > 0, true);
  }

  // Edge cases: nothing that fails may block or crash the prompt.
  {
    const home = makeHome(BASE_HOOKS);
    const id = newSession();
    const nope = path.join(scratch, 'nope.jsonl');

    check('missing transcript on the first prompt is silent', prompt(home, id, nope), undefined);
    setHooks(home, WITH_LANGUAGE);
    check('missing transcript still warns (the start marker is optional)', contextOf(prompt(home, id, nope)).length > 0, true);
    check('payload without transcript_path still works', prompt(home, newSession(), undefined), undefined);
    check('payload without session_id is silent', evaluate(JSON.stringify({ hook_event_name: 'UserPromptSubmit' }), { home }), undefined);
    check('a session id that is not a plain name is silent', evaluate(JSON.stringify({ session_id: '../x', transcript_path: transcript() }), { home }), undefined);
    check('garbage payload is silent', evaluate('{not json', { home }), undefined);
    const bomId = newSession();
    const bomFile = transcript();

    prompt(makeHome(BASE_HOOKS), bomId, bomFile);
    check('BOM payload is parsed', contextOf(evaluate(`﻿${JSON.stringify({ session_id: bomId, transcript_path: bomFile })}`, { home: makeHome(WITH_LANGUAGE) })).length > 0, true);
    check('a subagent caller is never judged', evaluate(JSON.stringify({ session_id: newSession(), agent_id: 'a1' }), { home }), undefined);

    const broken = makeHome(BASE_HOOKS);
    const brokenId = newSession();

    prompt(broken, brokenId, transcript());
    writeFileSync(path.join(broken, 'settings.json'), '{not json', 'utf8');
    check('unreadable settings are silent', prompt(broken, brokenId, transcript()), undefined);
    rmSync(path.join(broken, 'settings.json'));
    check('absent settings are silent', prompt(broken, brokenId, transcript()), undefined);

    const noBaseline = makeHome(BASE_HOOKS);
    const nbId = newSession();

    writeFileSync(path.join(noBaseline, 'settings.json'), '{not json', 'utf8');
    check('unreadable settings on the first prompt are silent', prompt(noBaseline, nbId, transcript()), undefined);
    setHooks(noBaseline, WITH_LANGUAGE);
    check('and record no baseline, so the next prompt is the first', prompt(noBaseline, nbId, transcript()), undefined);

    const missingManifest = makeHome(BASE_HOOKS, {});
    const mmId = newSession();

    prompt(missingManifest, mmId, transcript());
    setHooks(missingManifest, WITH_LANGUAGE);
    check('a missing manifest still warns, naming the registration', contextOf(prompt(missingManifest, mmId, transcript())).includes('pretooluse-language'), true);

    const plainCommand = makeHome(BASE_HOOKS);
    const pcId = newSession();

    prompt(plainCommand, pcId, transcript());
    setHooks(plainCommand, { ...BASE_HOOKS, SessionEnd: [group('', 'node "$HOME/.claude/some/other-hook.mjs"')] });
    check('a plain command group is named by its command', contextOf(prompt(plainCommand, pcId, transcript())).includes('other-hook.mjs'), true);

    const localHome = makeHome(BASE_HOOKS);
    const lId = newSession();

    prompt(localHome, lId, transcript());
    writeFileSync(path.join(localHome, 'settings.local.json'), JSON.stringify({ hooks: { Stop: [group('', 'node "$HOME/.claude/local-hook.mjs"')] } }), 'utf8');
    check('settings.local.json groups count too', contextOf(prompt(localHome, lId, transcript())).includes('local-hook.mjs'), true);

    const lateTranscript = makeHome(BASE_HOOKS);
    const ltId = newSession();
    const ltFile = transcript();

    prompt(lateTranscript, ltId, nope);
    setHooks(lateTranscript, WITH_LANGUAGE);
    check('a start marker that appears later is not a restart', contextOf(prompt(lateTranscript, ltId, ltFile)).length > 0, true);

    const lostTranscript = makeHome(BASE_HOOKS);
    const lostId = newSession();

    prompt(lostTranscript, lostId, transcript());
    setHooks(lostTranscript, WITH_LANGUAGE);
    check('a transcript that becomes unreadable is not a restart', contextOf(prompt(lostTranscript, lostId, nope)).length > 0, true);

    const absent = makeHome(BASE_HOOKS);
    const absentId = newSession();

    rmSync(path.join(absent, 'settings.json'));
    check('absent settings on the first prompt are silent', prompt(absent, absentId, transcript()), undefined);
    setHooks(absent, WITH_LANGUAGE);
    check('and record no baseline, so the next prompt is the first', prompt(absent, absentId, transcript()), undefined);

    const sameCommand = makeHome(BASE_HOOKS);
    const scId = newSession();

    prompt(sameCommand, scId, transcript());
    setHooks(sameCommand, { ...BASE_HOOKS, PreToolUse: [group('Bash', dispatchCommand('pretooluse-shell')), group('Write', dispatchCommand('pretooluse-shell'))] });
    check('the same command under another matcher is a new group', contextOf(prompt(sameCommand, scId, transcript())).length > 0, true);

    const otherEvent = makeHome(BASE_HOOKS);
    const oeId = newSession();

    prompt(otherEvent, oeId, transcript());
    setHooks(otherEvent, { ...BASE_HOOKS, PostToolUse: [group('Bash', dispatchCommand('pretooluse-shell'))] });
    check('the same command and matcher under another event is a new group', contextOf(prompt(otherEvent, oeId, transcript())).length > 0, true);

    const staleSub = makeHome(BASE_HOOKS);
    const ssId = newSession();

    prompt(staleSub, ssId, transcript());
    setHooks(staleSub, WITH_LANGUAGE);
    check('a subagent caller of a stale session is never warned', prompt(staleSub, ssId, transcript(), { agent_id: 'a1' }), undefined);

    const escaping = makeHome(BASE_HOOKS);

    prompt(escaping, '../escape', transcript());
    setHooks(escaping, WITH_LANGUAGE);
    check('a session id that climbs out of the state directory is never recorded', prompt(escaping, '../escape', transcript()), undefined);

    const dupHome = makeHome(BASE_HOOKS);
    const dId = newSession();

    prompt(dupHome, dId, transcript());
    setHooks(dupHome, { ...BASE_HOOKS, Stop: [...BASE_HOOKS.Stop, ...BASE_HOOKS.Stop] });
    check('a duplicated identical group is not a new guard', prompt(dupHome, dId, transcript()), undefined);
  }

  // The process shell, driven with a real-shaped payload (the shape measured from a live UserPromptSubmit).
  {
    const home = makeHome(BASE_HOOKS);
    const env = { ...process.env, HOOK_CLAUDE_HOME: home };
    const id = newSession();
    const file = transcript();
    const payload = { session_id: id, transcript_path: file, cwd: scratch, prompt_id: 'p1', permission_mode: 'auto', hook_event_name: 'UserPromptSubmit', prompt: 'hola' };
    const cli = (input) => spawnSync(process.execPath, [path.join(import.meta.dirname, 'prompt-hook.mjs')], { input, encoding: 'utf8', env });

    const first = cli(JSON.stringify(payload));

    check('cli: first prompt exits 0 and prints nothing', first.status === 0 && first.stdout === '', true);
    setHooks(home, WITH_LANGUAGE);
    const stale = cli(JSON.stringify(payload));

    check('cli: a stale session exits 0', stale.status, 0);
    check('cli: a stale session prints the additionalContext', JSON.parse(stale.stdout || '{}').hookSpecificOutput?.additionalContext?.includes('pretooluse-language'), true);
    const broken = cli('{x');

    check('cli: broken payload prints nothing and exits 0', broken.stdout === '' && broken.status === 0, true);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
