#!/usr/bin/env node
/**
 * Self-test for the agent-model-guard. It drives the DECISION through `evaluate(raw)` with payloads shaped like
 * the harness's, over a SANDBOX Claude home (`HOOK_CLAUDE_HOME`) holding its own `agents/` directory, never the
 * live one. It asserts the refusal text as well as the verdict, then the wiring: the registration declaration
 * and the delegation manifest.
 *
 * @es Auto-test del guard agent-model-guard. Ejercita la DECISIÓN con `evaluate(raw)` sobre payloads con la
 * forma del harness, en un home de Claude de PRUEBA (`HOOK_CLAUDE_HOME`) con su propio directorio `agents/`,
 * nunca el real. Afirma el texto del rechazo además del veredicto, y luego el cableado: la declaración de
 * registro y el manifiesto de delegación.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLAUDE_HOME_VARIABLE, isolateState } from '../hook-state/locations.mjs';
import { evaluate } from './guard.mjs';

isolateState('agent-model-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-delegation.json');

const home = mkdtempSync(path.join(tmpdir(), 'agent-model-guard-home-'));
const agents = path.join(home, 'agents');

process.env[CLAUDE_HOME_VARIABLE] = home;
process.once('exit', () => rmSync(home, { recursive: true, force: true }));
mkdirSync(agents);

const role = (name, text) => writeFileSync(path.join(agents, `${name}.md`), text);

role('jd-judge-a', '---\nname: jd-judge-a\nmodel: opus\n---\nBody mentions model: sonnet.\n');
role('crlf-opus', '---\r\nname: crlf-opus\r\nmodel: "opus"\r\n---\r\nBody\r\n');
role('review-risk', '---\nname: review-risk\nmodel: sonnet\n---\nBody\n');
role('body-only', '---\nname: body-only\n---\nmodel: opus\n');
role('no-frontmatter', 'name: no-frontmatter\nmodel: opus\n---\nBody\n');
role('unclosed', '---\nname: unclosed\nmodel: opus\n');
role('upper-opus', '---\nname: upper-opus\nmodel: Opus\n---\nBody\n');

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) return;

  failures += 1;
  console.error(`FAIL: ${label}${detail === '' ? '' : ` -- ${detail}`}\n@es FALLO: ${label}`);
}

const call = (input, toolName = 'Agent') => JSON.stringify({ session_id: 'agent-model-guard-proof', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: { prompt: 'x', ...input } });
// A throw of `evaluate` is a verdict (THROWS) the checks below fail on, never a crash of the proof.
// @es Una excepción de `evaluate` es un veredicto (THROWS) que los checks suspenden, nunca un crash de la prueba.
const output = (raw) => {
  try {
    return evaluate(raw);
  } catch {
    return 'THROWS';
  }
};
const verdict = (raw) => output(raw)?.hookSpecificOutput?.permissionDecision ?? output(raw);
const reason = (raw) => output(raw)?.hookSpecificOutput?.permissionDecisionReason ?? '';
const refused = (label, raw) => check(label, verdict(raw) === 'deny', `got ${verdict(raw)}`);
const allowed = (label, raw) => check(label, output(raw) === undefined, `got ${verdict(raw)}`);

// ---- the model must be named ----------------------------------------------------------------------------
refused('no model is refused', call({ subagent_type: 'general-purpose' }));
refused('an empty model is refused', call({ model: '' }));
refused('a blank model is refused', call({ model: '   ' }));
refused('a non-string model is refused', call({ model: 7 }));
refused('a missing model is refused on the legacy Task tool', call({}, 'Task'));

// ---- haiku and sonnet are never judged ------------------------------------------------------------------
allowed('sonnet is allowed', call({ model: 'sonnet' }));
allowed('haiku is allowed', call({ model: 'haiku' }));
allowed('sonnet with a role is allowed', call({ model: 'sonnet', subagent_type: 'jd-judge-a' }));

// ---- opus only for a role that declares it ---------------------------------------------------------------
allowed('opus with a role declaring opus is allowed', call({ model: 'opus', subagent_type: 'jd-judge-a' }));
allowed('opus with a CRLF, quoted declaration is allowed', call({ model: 'opus', subagent_type: 'crlf-opus' }));
allowed('opus is allowed on the legacy Task tool for a declaring role', call({ model: 'opus', subagent_type: 'jd-judge-a' }, 'Task'));
refused('opus with general-purpose is refused', call({ model: 'opus', subagent_type: 'general-purpose' }));
refused('opus with no subagent_type is refused', call({ model: 'opus' }));
refused('opus with an empty subagent_type is refused', call({ model: 'opus', subagent_type: '' }));
refused('opus with a role declaring sonnet is refused', call({ model: 'opus', subagent_type: 'review-risk' }));
refused('opus with a missing role file is refused', call({ model: 'opus', subagent_type: 'no-such-role' }));
refused('opus with a role whose body, not frontmatter, says opus is refused', call({ model: 'opus', subagent_type: 'body-only' }));
refused('opus with a role file lacking frontmatter is refused', call({ model: 'opus', subagent_type: 'no-frontmatter' }));
refused('opus with a role whose frontmatter is never closed is refused', call({ model: 'opus', subagent_type: 'unclosed' }));
allowed('opus with a role declaring Opus in capitals is allowed', call({ model: 'opus', subagent_type: 'upper-opus' }));
refused('opus with a path-climbing role is refused', call({ model: 'opus', subagent_type: '../agents/jd-judge-a' }));
refused('a differently cased Opus is judged as opus', call({ model: 'Opus', subagent_type: 'general-purpose' }));
refused('a full opus model id is judged as opus', call({ model: 'claude-opus-4', subagent_type: 'general-purpose' }));

// ---- the refusal text ------------------------------------------------------------------------------------
const text = reason(call({ model: 'opus', subagent_type: 'general-purpose' }));
const missing = reason(call({}));

check('the refusal names the rule file in both languages', text.includes('Rule: rules/10-contracts.md') && text.includes('Regla: rules/10-contracts.md'));
check('the no-model refusal names the rule file in both languages', missing.includes('Rule: rules/10-contracts.md') && missing.includes('Regla: rules/10-contracts.md'));
check('the refusal names the tool', text.includes('(Agent)') && reason(call({}, 'Task')).includes('(Task)'));
check('the refusal is the event of a PreToolUse deny', output(call({}))?.hookSpecificOutput?.hookEventName === 'PreToolUse');
check('a null tool_input passes', output(JSON.stringify({ tool_name: 'Agent', tool_input: null })) === undefined);
check('the refusal names the allowed values', text.includes('haiku') && text.includes('sonnet') && text.includes('opus'));
check('the refusal names the offending role', text.includes('general-purpose'));
check('the refusal lists the roles that declare opus', text.includes('jd-judge-a') && text.includes('crlf-opus') && !text.includes('review-risk'));
check('the refusal is bilingual', text.includes('RECHAZ') && text.includes('REFUSED'));
check('the missing-model refusal is its own message and names the rule', missing !== text && missing.includes('rules/10-contracts.md') && missing.includes('haiku'));
check('the no-role opus refusal says so', reason(call({ model: 'opus' })).includes('with no subagent_type'));

// ---- other tools and malformed input pass ---------------------------------------------------------------
allowed('SendMessage passes', JSON.stringify({ tool_name: 'SendMessage', tool_input: { to: 'a', message: 'hi' } }));
allowed('Bash passes', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }));
allowed('malformed JSON passes (fail open)', '{not json');
allowed('an empty payload passes', '');
allowed('JSON that is not an object passes', 'null');
allowed('an Agent payload with no tool_input passes', JSON.stringify({ tool_name: 'Agent' }));
allowed('a BOM-prefixed payload is parsed', `﻿${call({ model: 'sonnet' })}`);
refused('a BOM-prefixed refusal still refuses', `﻿${call({})}`);

// ---- an unreadable agents directory means "declares nothing", never a crash -------------------------------
const broken = mkdtempSync(path.join(tmpdir(), 'agent-model-guard-broken-'));

writeFileSync(path.join(broken, 'agents'), 'a file where the directory should be');
process.env[CLAUDE_HOME_VARIABLE] = broken;
refused('with no agents directory opus is refused, not crashed', call({ model: 'opus', subagent_type: 'jd-judge-a' }));
allowed('with no agents directory sonnet is still allowed', call({ model: 'sonnet' }));
check('with no agents directory the refusal says no role was found, in both languages', reason(call({})).includes('none found') && reason(call({})).includes('ninguno encontrado'));
process.env[CLAUDE_HOME_VARIABLE] = home;
rmSync(broken, { recursive: true, force: true });

// ---- as a process: stdin in, deny JSON out, exit 0 always -----------------------------------------------
const run = (input) => spawnSync(process.execPath, [path.join(HERE, 'guard.mjs')], { input, encoding: 'utf8', env: process.env });
const denied = run(call({}));
const passed = run(call({ model: 'sonnet' }));
const garbage = run('{not json');

check('the process prints the deny and exits 0', denied.status === 0 && denied.stdout.includes('"permissionDecision":"deny"'));
check('the process prints nothing for an allowed call', passed.status === 0 && passed.stdout === '');
check('the process prints nothing and exits 0 on garbage', garbage.status === 0 && garbage.stdout === '');

// ---- the wiring -------------------------------------------------------------------------------------------
const registration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

check('registered on PreToolUse for Agent|Task only', registration.registrations.length === 1 && registration.registrations[0].event === 'PreToolUse' && registration.registrations[0].matcher === 'Agent|Task');
check('the registration explains why', typeof registration.why === 'string' && registration.why.length > 20);
check('the guard is the last entry of the delegation manifest', manifest.guards.at(-1) === '../../agent-model-guard/guard.mjs');
check('the manifest names the guard once', manifest.guards.filter((guard) => guard.includes('agent-model-guard')).length === 1);

if (failures > 0) {
  console.error(`agent-model-guard selftest: ${failures} failure(s)\n@es agent-model-guard selftest: ${failures} fallo(s)`);
  process.exit(1);
}

console.log('agent-model-guard selftest: all checks passed.\n@es agent-model-guard selftest: todas las comprobaciones pasaron.');
