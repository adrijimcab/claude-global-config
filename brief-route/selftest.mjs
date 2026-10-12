#!/usr/bin/env node
/**
 * Self-test for the brief-route guard. It exercises the DECISION over the whole grammar of the ROUTE line (both
 * forms, every near miss an author trying to comply can write, the layout the line tolerates) and asserts the
 * REFUSAL TEXT as well as the verdict, because a guard that denies for the wrong stated reason gets routed
 * around. Payloads come from `~/.claude/hook-payloads/payloads.mjs`, which substitutes text into a payload
 * RECORDED from the harness, so a proof cannot agree with the guard by inventing the field a tool carries its
 * brief in. The last blocks assert the wiring: the declaration matches the tools the decision reads, and the
 * guard is part of the delegation manifest that `preflight.mjs` runs, proved by running that manifest.
 *
 * @es Auto-test del guard brief-route. Ejercita la DECISIÓN sobre toda la gramática de la línea ROUTE (las dos
 * formas, cada casi-acierto que puede escribir quien intenta cumplir, la maquetación que la línea tolera) y
 * afirma el TEXTO del rechazo además del veredicto. Los payloads salen de `payloads.mjs`, que sustituye texto en
 * un payload REGISTRADO del harness. Los últimos bloques afirman el cableado: la declaración coincide con las
 * herramientas que lee la decisión, y el guard forma parte del manifiesto de delegación que corre
 * `preflight.mjs`, probado corriendo ese manifiesto.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BRIEF_CARRIERS } from '../brief-provenance/provenance.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { draftPayload, preflight } from '../brief-feasibility/preflight.mjs';
import { evaluate } from './guard.mjs';
import { refusalReason } from './refusal-text.mjs';
import { isFeatureName, inspectRoute, MAX_FEATURE_NAME_LENGTH } from './route-line.mjs';

isolateState('brief-route');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FLEET = path.resolve(HERE, '..');
const GUARD = path.join(HERE, 'guard.mjs');
const MANIFEST = path.join(FLEET, 'hook-dispatch', 'manifests', 'pretooluse-delegation.json');

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;

  if (condition) return;

  failures += 1;
  console.error(`FAIL: ${label}${detail === '' ? '' : ` -- ${detail}`}\n@es FALLO: ${label}`);
}

const state = (text) => inspectRoute(text).state;
const FEATURE = 'agent-contract-shared';
const MARKERS = 'MEASURED: none\nHYPOTHESIS: none';

// ---- the grammar: the two forms ---------------------------------------------------------------------------
check('ROUTE: direct is present', state('ROUTE: direct') === 'present' && inspectRoute('ROUTE: direct').route === 'direct');
check('ROUTE: tracked-odd <feature> is present and carries the feature', inspectRoute(`ROUTE: tracked-odd ${FEATURE}`).route === 'tracked-odd' && inspectRoute(`ROUTE: tracked-odd ${FEATURE}`).feature === FEATURE);
check('no space after the colon is still the form', state('ROUTE:direct') === 'present');
check('trailing blanks after the value are layout', state('ROUTE: direct   ') === 'present' && state(`ROUTE: tracked-odd ${FEATURE}  `) === 'present');
check('a one-character feature name', inspectRoute('ROUTE: tracked-odd a').feature === 'a');
check('a feature name with digits', inspectRoute('ROUTE: tracked-odd v2-2fa').feature === 'v2-2fa');
check('a feature name of exactly the maximum length', state(`ROUTE: tracked-odd ${'a'.repeat(MAX_FEATURE_NAME_LENGTH)}`) === 'present');
check('the maximum length is 64', MAX_FEATURE_NAME_LENGTH === 64);

// ---- the grammar: layout the line tolerates ----------------------------------------------------------------
check('a route among the markers', state(`${MARKERS}\nROUTE: direct\nDo the work.`) === 'present');
check('the first line of the brief', state('ROUTE: direct\nbody') === 'present');
check('an indented route', state('   ROUTE: direct') === 'present');
check('a CRLF brief', state(`${MARKERS}\r\nROUTE: direct\r\nbody`) === 'present');
for (const mark of ['-', '*', '+', '#', '>']) check(`a "${mark}" list or heading prefix`, state(`${mark} ROUTE: direct`) === 'present');

// ---- the near misses ----------------------------------------------------------------------------------------
check('no ROUTE anywhere is absent', state('Do the work.\nMEASURED: none') === 'absent');
check('the word in prose without a colon is absent, not a heading', state('Pick the ROUTE of the request later.') === 'absent');
check('a route inside a sentence is buried', state('Follow the ROUTE: direct as agreed.') === 'buried');
check('a lowercase route is not the word', state('route: direct') === 'absent');
check('ROUTES: is another word', state('ROUTES: direct') === 'absent');
check('ROUTED: is another word', state('ROUTED: direct') === 'absent');
check('ROUTEx: is another word', state('ROUTEx: direct') === 'absent');
check('the bare word alone on its line is malformed', state('ROUTE') === 'malformed');
check('no colon is malformed', state('ROUTE direct') === 'malformed');
check('a space before the colon is malformed', state('ROUTE : direct') === 'malformed');
check('a qualifier before the colon is malformed (unlike MEASURED)', state('ROUTE (by me): direct') === 'malformed');
check('an empty value is malformed', state('ROUTE:') === 'malformed' && state('ROUTE:   ') === 'malformed');
check('a capitalised value is malformed', state('ROUTE: Direct') === 'malformed');
check('an unknown value is malformed', state('ROUTE: tracked') === 'malformed' && state('ROUTE: inline') === 'malformed');
check('a free-text tail on direct is malformed', state('ROUTE: direct because the design is settled') === 'malformed');
check('quotes around the value are malformed', state('ROUTE: "direct"') === 'malformed');
check('tracked-odd without a feature is malformed', state('ROUTE: tracked-odd') === 'malformed' && state('ROUTE: tracked-odd ') === 'malformed');
check('tracked_odd with an underscore is malformed', state(`ROUTE: tracked_odd ${FEATURE}`) === 'malformed');
check('a feature name with an uppercase letter is malformed', state('ROUTE: tracked-odd Feature') === 'malformed');
check('a feature name with an underscore is malformed', state('ROUTE: tracked-odd my_feature') === 'malformed');
check('a feature name with a double hyphen is malformed', state('ROUTE: tracked-odd my--feature') === 'malformed');
check('a feature name with a leading hyphen is malformed', state('ROUTE: tracked-odd -feature') === 'malformed');
check('a feature name with a trailing hyphen is malformed', state('ROUTE: tracked-odd feature-') === 'malformed');
check('a feature name with a space is malformed', state('ROUTE: tracked-odd two words') === 'malformed');
check('two spaces before the feature name are malformed', state('ROUTE: tracked-odd  x') === 'malformed');
check('a feature name with a dot or a slash is malformed', state('ROUTE: tracked-odd a.b') === 'malformed' && state('ROUTE: tracked-odd a/b') === 'malformed');
check('a feature name one over the maximum is malformed', state(`ROUTE: tracked-odd ${'a'.repeat(MAX_FEATURE_NAME_LENGTH + 1)}`) === 'malformed');
check('the malformed line is carried for the refusal', inspectRoute('  - ROUTE: direct because').line === 'ROUTE: direct because');
check('every lowercase letter and digit is a feature-name character', isFeatureName('abcdefghijklmnopqrstuvwxyz-0123456789'));
check('the empty string is not a feature name', isFeatureName('') === false);
check('the malformed line is carried without its line ending', inspectRoute('ROUTE: direct because\r\nnext').line === 'ROUTE: direct because');
check('a ROUTE later in a line whose fifth character is not a letter is buried, not a heading', state('12345 ROUTE: direct') === 'buried');
check('two identical route lines are multiple', state('ROUTE: direct\nROUTE: direct') === 'multiple');
check('two different route lines are multiple and both are carried', inspectRoute(`ROUTE: direct\nROUTE: tracked-odd ${FEATURE}`).lines?.length === 2);
check('a valid route beside a malformed one is multiple, not present', state('ROUTE: direct\nROUTE: nonsense') === 'multiple');

// ---- the hook, with payloads recorded from the harness --------------------------------------------------------
const SESSION = 'selftest';
const agent = (text) => JSON.stringify(payloadFor('Agent', text, { sessionId: SESSION }));
const task = (text) => JSON.stringify(payloadFor('Agent', text, { toolName: 'Task', sessionId: SESSION }));
const resume = (text) => JSON.stringify(payloadFor('SendMessage', text, { sessionId: SESSION }));

function run(input) {
  const result = spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8' });

  return { status: result.status, decision: result.stdout === '' ? undefined : JSON.parse(result.stdout).hookSpecificOutput };
}

/**
 * `evaluate` called in process: a throw is a value that fails the CHECK, because the shim around it swallows a
 * throw (fail open) and a spawn alone cannot tell a decision from a swallowed crash.
 * @es `evaluate` llamada en el proceso: un lanzamiento es un valor que hace fallar el CHECK, porque el shim
 * que la rodea se traga un lanzamiento (falla abierto) y un spawn solo no distingue una decisión de una caída tragada.
 */
function evaluated(input) {
  try {
    return { output: evaluate(input) };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

const allowedInProcess = (input) => {
  const result = evaluated(input);

  return result.threw === undefined && result.output === undefined;
};

check('evaluate allows a tool that carries no brief without throwing', allowedInProcess(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } })));
check('evaluate allows a brief with a route without throwing', allowedInProcess(agent(`${MARKERS}\nROUTE: direct`)));
check('evaluate denies a brief without a route without throwing', evaluated(agent(MARKERS)).output?.hookSpecificOutput?.permissionDecision === 'deny');
check('the refusal text is undefined for a present route', (() => { try { return refusalReason({ state: 'present', route: 'direct' }, { surface: 'delegation', toolName: 'Agent' }) === undefined; } catch { return false; } })());

const reasonOf = (input) => String(run(input).decision?.permissionDecisionReason);

check('a delegation with a route is allowed', run(agent(`${MARKERS}\nROUTE: direct`)).decision === undefined);
check('a delegation with a tracked route is allowed', run(agent(`${MARKERS}\nROUTE: tracked-odd ${FEATURE}`)).decision === undefined);
check('a Task with a route is allowed', run(task(`${MARKERS}\nROUTE: direct`)).decision === undefined);
check('a resume with a route is allowed', run(resume(`${MARKERS}\nROUTE: direct`)).decision === undefined);
check('the hook exits 0 on every path', run(agent(MARKERS)).status === 0 && run(agent(`${MARKERS}\nROUTE: direct`)).status === 0);

const absent = run(agent(MARKERS));

check('a delegation without a route is denied', absent.decision?.permissionDecision === 'deny');
check('the denial is for PreToolUse', absent.decision?.hookEventName === 'PreToolUse');
check('the denial names the ABSENT state', String(absent.decision?.permissionDecisionReason).includes('ABSENT'));
check('the denial shows the grammar', String(absent.decision?.permissionDecisionReason).includes('ROUTE: tracked-odd <feature-name>') && String(absent.decision?.permissionDecisionReason).includes('ROUTE: direct'));
check('the denial says the choice is the orchestrator\'s and never guessed', String(absent.decision?.permissionDecisionReason).includes('never judges the choice'));
check('the denial carries the Spanish half', String(absent.decision?.permissionDecisionReason).includes('@es') && String(absent.decision?.permissionDecisionReason).includes('LA GRAMÁTICA'));
check('a delegation refusal names its surface', reasonOf(agent(MARKERS)).includes('this delegation (Agent)'));
check('a Task refusal names its surface', reasonOf(task(MARKERS)).includes('this delegation (Task)'));
check('a resume refusal names its surface', reasonOf(resume(MARKERS)).includes('this message (SendMessage)'));
check('a buried route names the NEAR MISS', reasonOf(agent(`${MARKERS}\nFollow ROUTE: direct as agreed`)).includes('NEAR MISS'));
check('a malformed route names MALFORMED and carries the line', reasonOf(agent(`${MARKERS}\nROUTE: direct because settled`)).includes('MALFORMED') && reasonOf(agent(`${MARKERS}\nROUTE: direct because settled`)).includes('ROUTE: direct because settled'));
check('two routes name MULTIPLE and the count', reasonOf(agent(`${MARKERS}\nROUTE: direct\nROUTE: tracked-odd ${FEATURE}`)).includes('MULTIPLE') && reasonOf(agent(`${MARKERS}\nROUTE: direct\nROUTE: tracked-odd ${FEATURE}`)).includes('2 ROUTE lines'));
check('a payload with a byte-order mark is still judged', run(`﻿${agent(MARKERS)}`).decision?.permissionDecision === 'deny');
check('a payload that is not JSON is allowed (fail open)', run('not json').decision === undefined);
check('a tool that carries no brief is allowed', run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: SESSION })).decision === undefined);
check('a whitespace-only brief is allowed (there is no brief to judge)', run(agent('   \n  ')).decision === undefined);
check('a short brief is refused too: length is not the variable', run(agent('read the file and report')).decision?.permissionDecision === 'deny');

// ---- the wiring -----------------------------------------------------------------------------------------------
const declaration = JSON.parse(readFileSync(`${GUARD}.hook-registration.json`, 'utf8'));
const declaredTools = String(declaration.registrations?.[0]?.matcher).split('|').toSorted();
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

check('the sidecar registers PreToolUse', declaration.registrations?.[0]?.event === 'PreToolUse');
check('the sidecar registers exactly the tools whose brief the decision reads', JSON.stringify(declaredTools) === JSON.stringify(Object.keys(BRIEF_CARRIERS).toSorted()), JSON.stringify(declaredTools));
check('the delegation manifest lists the guard', manifest.guards.includes('../../brief-route/guard.mjs'));
check('the delegation manifest lists it once', manifest.guards.filter((guard) => guard === '../../brief-route/guard.mjs').length === 1);

// A manifest holding ONLY this guard, so the proof does not depend on the folders of the other nine guards of
// the real manifest; that the real manifest lists this guard is the check above.
// @es Un manifiesto con SOLO este guard, para que la prueba no dependa de las carpetas de los otros nueve
// guards del manifiesto real; que el manifiesto real lista este guard es la comprobación de arriba.
const scratch = mkdtempSync(path.join(tmpdir(), 'brief-route-'));
const ownManifest = path.join(scratch, 'only-brief-route.json');

writeFileSync(ownManifest, JSON.stringify({ event: 'PreToolUse', guards: [GUARD] }));

const draftOptions = { tool: 'Agent', description: 'selftest', isolation: undefined, to: undefined, cwd: FLEET };
const ran = await preflight(draftPayload(MARKERS, draftOptions), [ownManifest]);
const ranWithRoute = await preflight(draftPayload(`${MARKERS}\nROUTE: direct`, draftOptions), [ownManifest]);

rmSync(scratch, { recursive: true, force: true });

check('preflight runs the manifest without a problem', ran.problems.length === 0 && ranWithRoute.problems.length === 0, JSON.stringify(ran.problems));
check('preflight refuses a draft with no route, through the manifest', ran.refusals.some((refusal) => refusal.reason.includes('BRIEF-ROUTE REFUSED')));
check('preflight does not refuse a draft that carries a route', !ranWithRoute.refusals.some((refusal) => refusal.reason.includes('BRIEF-ROUTE REFUSED')));

console.log(`${String(checks - failures)}/${String(checks)} checks passed. @es ${String(checks - failures)}/${String(checks)} comprobaciones pasaron.`);
process.exit(failures === 0 ? 0 : 1);
