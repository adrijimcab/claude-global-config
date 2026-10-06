#!/usr/bin/env node
/**
 * Self-test for the brief-provenance guard.
 *
 * It exercises the DECISION's state space, not merely that the guard fires — the `guard-that-cannot-
 * go-red` rule was promoted into the global contract precisely because two mechanisms of mine passed
 * their own tests while deciding wrongly. Testing that something FIRES is not testing that it
 * DISCRIMINATES, and the states your first real cases happen to contain are not the states that exist.
 *
 * TWO THINGS ARE ASSERTED PER CASE: the VERDICT, and a fragment of the REFUSAL TEXT. A guard that
 * denies for the wrong stated reason gets routed around — the third face of the same rule. Checking
 * only deny/allow cannot tell "refused because the word is buried" from "refused because it is absent",
 * and those two need different fixes.
 *
 * EVERY PAYLOAD HAS THE SHAPE THE HARNESS SENDS, and this is the part the previous version lacked. It
 * built `SendMessage` payloads as `{ tool_input: { prompt } }` and passed 26 of 26 while the guard read
 * a field `SendMessage` never carries: a real resume with no declaration was ALLOWED, silently, on every
 * send. The payloads now come from `~/.claude/hook-payloads/payloads.mjs`, which substitutes text into a RECORDED
 * payload without naming any field, so the proof cannot agree with the guard by construction.
 *
 * AND THE WIRING IS PART OF THE PROOF. The guard decided for `SendMessage` in code while the settings
 * registered it only for `Agent|Task`, and nothing compared the two. The last block asserts the chain
 * code → declaration: the tools the decision reads a brief from are exactly the tools
 * `guard.mjs.hook-registration.json` declares, and each reads the field its recording carries in full.
 * The fleet self-check (`.claude/hook-registration-selfcheck/`) asserts the other link, declaration →
 * registration, on every prompt.
 *
 * @es Auto-test del guard. Ejercita el espacio de estados de la DECISIÓN y afirma dos cosas por caso:
 * el veredicto y un fragmento del texto del rechazo. TODO PAYLOAD TIENE LA FORMA QUE ENVÍA EL HARNESS:
 * la versión anterior construía los de `SendMessage` con `prompt` y pasaba 26/26 mientras un resume real
 * sin declaración se PERMITÍA en silencio. Y EL CABLEADO ES PARTE DE LA PRUEBA: el último bloque afirma
 * que las herramientas de las que la decisión lee un brief son exactamente las que declara el sidecar de
 * registro, y que cada una lee el campo que su grabación lleva entero.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { payloadFor, recordedPayload } from '../hook-payloads/payloads.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('brief-provenance');

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const DECLARATION = join(HERE, 'guard.mjs.hook-registration.json');

const long = (extra = '') => `${'x'.repeat(1600)}\n${extra}`;

/** The session every payload here is journaled under, so no proof run reads as real traffic. @es La sesión con la que se registra todo payload de aquí. */
const SESSION = 'selftest';

/** A delegation brief, in the recorded Agent payload. @es Un brief de delegación en el payload registrado de Agent. */
const agent = (text) => JSON.stringify(payloadFor('Agent', text, { sessionId: SESSION }));

/** The same shape under the harness's older alias. @es La misma forma bajo el alias antiguo del harness. */
const task = (text) => JSON.stringify(payloadFor('Agent', text, { toolName: 'Task', sessionId: SESSION }));

/** A resume, in the payload CAPTURED from a real SendMessage call. @es Un resume, en el payload CAPTURADO de un SendMessage real. */
const resume = (text) => JSON.stringify(payloadFor('SendMessage', text, { sessionId: SESSION }));

const MEASURED_LINE = 'MEASURED: 24 symbols (etc/*.api.md)';
const HYPOTHESIS_LINE = 'HYPOTHESIS: none';
const BOTH_GLUED = `${MEASURED_LINE}\n${HYPOTHESIS_LINE}`;

const cases = [
  // ---------------------------------------------------------------------------------------------
  // ALLOWED — the brief declares its provenance. Both spellings of a declaration are legitimate.
  // ---------------------------------------------------------------------------------------------
  ['allow', agent(long(BOTH_GLUED)), 'both markers, colon glued to the word'],
  ['allow', agent(long('MEASURED: none — exploratory task.\nHYPOTHESIS: none')), 'explicitly no claims — the honest escape that keeps this cheap to satisfy'],
  // A qualifier before the colon satisfies the control rather than evading it. The first version of
  // this file expected `deny` here, and it cost three refused delegations in one session to learn the
  // old check tested a PROXY (colon glued to the word) for the real property (the marker heads a line).
  // @es Un cualificador antes del dos puntos satisface el control, no lo esquiva.
  [
    'allow',
    agent(long('MEASURED (by me, on develop just now): 70 of 70\nHYPOTHESIS — to confirm per commit: the cache is shared')),
    'REAL CASE: a qualifier before the colon is a declaration, not an evasion'
  ],
  ['allow', agent(long(`  - ${MEASURED_LINE}\n  - ${HYPOTHESIS_LINE}`)), 'indented markers — a bulleted brief still declares'],
  ['allow', agent(BOTH_GLUED.split('\n').join('\r\n')), 'CRLF brief — an invisible character must not refuse a correct brief'],
  ['allow', agent(BOTH_GLUED), 'marker on the very first line, no preceding newline'],
  ['allow', task(long(BOTH_GLUED)), 'the Task alias is covered by the same decision'],

  // ---------------------------------------------------------------------------------------------
  // REFUSED — and each state must be NAMED, because each has a different remedy.
  // ---------------------------------------------------------------------------------------------
  ['deny', agent(long()), 'neither marker', 'ABSENT'],
  ['deny', agent(long(MEASURED_LINE)), 'HYPOTHESIS missing', 'no HYPOTHESIS line at all'],
  ['deny', agent(long(HYPOTHESIS_LINE)), 'MEASURED missing', 'no MEASURED line at all'],
  [
    'deny',
    agent(long('as the MEASURED: value shows, and the HYPOTHESIS: was wrong')),
    'BURIED mid-sentence — this PASSED the old glued-colon check and is refused now',
    'not at the START of a line'
  ],
  ['deny', agent(long(`MEASURED 70 of 70 with no colon anywhere\n${HYPOTHESIS_LINE}`)), 'heads a line but carries no colon', 'carries no colon'],
  ['deny', agent(long(`MEASUREDLY: a different word entirely\n${HYPOTHESIS_LINE}`)), 'a prefix of a longer word must not satisfy the marker', 'MEASURED'],
  ['deny', agent(long(`MEASUREDly: a lowercase continuation is a different word too\n${HYPOTHESIS_LINE}`)), 'a lowercase continuation must not satisfy the marker', 'MEASURED'],
  // The words sit at offsets 8 and 10 of their lines with a blank just after: a check that looks at the
  // text past the word's LENGTH instead of past the word itself would read them as declarations.
  // @es Las palabras quedan en los desplazamientos 8 y 10 con un blanco justo después.
  ['deny', agent(long('Xxxxxxx. see MEASURED: 70 of 70\nYyyyyyyyy. see HYPOTHESIS: a guess')), 'BURIED after as many characters as the word is long', 'not at the START of a line'],
  ['deny', agent(long(`MEASURED\n${HYPOTHESIS_LINE}`)), 'the bare word alone on its line heads it, and carries no colon', 'carries no colon'],
  ['allow', agent(long(`MEASURED with no colon, then a real one below\nMEASURED: 24 symbols\n${HYPOTHESIS_LINE}`)), 'a later declaring line satisfies the marker after a colonless one'],
  ...['*', '+', '#', '>'].map((bullet) => ['allow', agent(long(`${bullet} ${MEASURED_LINE}\n${bullet} ${HYPOTHESIS_LINE}`)), `a "${bullet}" list or heading prefix still declares`]),
  ['deny', agent(long()), 'an Agent refusal names its surface', 'this delegation (Agent)'],
  ['deny', task(long()), 'a Task refusal names its surface', 'this delegation (Task)'],
  ['deny', resume(long()), 'a SendMessage refusal names its surface', 'this message (SendMessage)'],
  ['deny', `﻿${agent(long())}`, 'a BOM-prefixed payload is still judged', 'ABSENT'],
  ['deny', agent('read src/x.ts and report the export list'), 'a SHORT prompt is refused too — length is not the variable (the #115 brief was 1086 chars)', 'ABSENT'],
  ['deny', task(long()), 'the Task alias refuses exactly as Agent does', 'ABSENT'],

  // ---------------------------------------------------------------------------------------------
  // THE RESUME SURFACE, in the payload the harness really sends. The first case below is the exact
  // state that slipped: under the previous guard it was ALLOWED with no output, because the guard read
  // `tool_input.prompt` and a SendMessage has none. Both directions are exercised, because a rule that
  // only ever refuses on a surface has not been shown to decide anything there.
  // @es EL SURFACE DE RESUME, con el payload que el harness envía de verdad. El primer caso es el estado
  // exacto que se escapó: el guard anterior lo PERMITÍA sin salida, porque leía `prompt` y un
  // SendMessage no lo lleva. Se ejercitan LAS DOS direcciones.
  // ---------------------------------------------------------------------------------------------
  ['deny', resume(long()), 'REAL CASE: a resume with no declaration — the 2026-09-08 laundering shape', 'ABSENT'],
  ['allow', resume(long(BOTH_GLUED)), 'a resume that declares its provenance passes untouched — the surface can go GREEN'],
  [
    'allow',
    resume(long('MEASURED (by me, just now): develop is at 3ea04d36\nHYPOTHESIS — to confirm: the failure is pre-existing')),
    'NEAR MISS on the resume surface: a qualifier before the colon is a declaration here too'
  ],
  [
    'deny',
    resume(long('as the MEASURED: value shows, and the HYPOTHESIS: was wrong')),
    'a resume with the markers buried mid-sentence is refused, exactly as a brief is',
    'not at the START of a line'
  ],
  ['deny', resume('Another worker independently confirmed it. Both share the same reconstruction.'), 'a SHORT resume is refused too — length is not the variable on this surface either', 'ABSENT'],
  // The payload also carries `content`, a 50-character PREVIEW of the message. Markers placed after
  // character 1600 are absent from the preview and present in the message, so this case reddens a guard
  // that reads the preview instead of the text the worker receives.
  // @es El payload lleva también `content`, una VISTA PREVIA de 50 caracteres. Con los marcadores tras
  // el carácter 1600, este caso enrojece un guard que lea la vista previa en vez del mensaje.
  ['allow', resume(long(BOTH_GLUED)), 'the brief is read from the full message, never from its 50-character preview'],
  ['deny', resume(`Resume.\n${'y'.repeat(60)}`), 'a resume refused on its full text, not on a preview that happens to look empty', 'no MEASURED line at all'],
  ['allow', resume(''), 'a pure idle subscription carries message "" (the schema default) — nothing to declare'],

  // ---------------------------------------------------------------------------------------------
  // OUTSIDE THE DECISION — not a claim-bearing tool, or nothing to read.
  // ---------------------------------------------------------------------------------------------
  ['allow', JSON.stringify({ tool_name: 'Bash', tool_input: { command: long() } }), 'not a claim-bearing tool'],
  ['allow', JSON.stringify({ ...payloadFor('Agent', '', { sessionId: SESSION }), tool_input: {} }), 'no prompt at all'],
  ['allow', agent('   \n  '), 'whitespace-only prompt'],
  ['allow', JSON.stringify({ ...payloadFor('SendMessage', '', { sessionId: SESSION }), tool_input: { to: 'main', message: { type: 'shutdown_response' } } }), 'a structured (non-string) message carries no brief'],

  // ---------------------------------------------------------------------------------------------
  // FAIL-OPEN — every malfunction of its own machinery must let the delegation run.
  // ---------------------------------------------------------------------------------------------
  ['allow', 'NOT JSON AT ALL', 'garbage payload'],
  ['allow', '', 'empty payload'],
  ['allow', '{"tool_name":', 'truncated json'],
  ['allow', '﻿NOT JSON', 'BOM + garbage']
];

let failures = 0;
let total = 0;

/** Records one outcome and prints it. @es Registra un resultado y lo imprime. */
function report(ok, line) {
  total += 1;

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

for (const [expected, input, label, expectedText] of cases) {
  let output = '';
  let code = 0;

  try {
    output = execFileSync('node', [GUARD], { input, encoding: 'utf8' });
  } catch (error) {
    code = error.status;
    output = error.stdout ?? '';
  }

  const actual = output.includes('"deny"') ? 'deny' : 'allow';
  // The reason travels inside a JSON string, so the fragment is checked against the raw payload.
  const textOk = expectedText === undefined || output.includes(expectedText);
  const why = textOk ? '' : `  [the refusal never named: ${expectedText}]`;

  report(actual === expected && code === 0 && textOk, `expected=${expected} actual=${actual} exit=${code}  ${label}${why}`);
}

// ---------------------------------------------------------------------------------------------
// THE WIRING: code → declaration. A decision that covers a tool its declaration does not name is the
// exact drift that left SendMessage unguarded while the code claimed it.
// @es EL CABLEADO: código → declaración. Una decisión que cubre una herramienta que su declaración no
// nombra es exactamente la deriva que dejó SendMessage sin guardar mientras el código lo reclamaba.
// ---------------------------------------------------------------------------------------------

/** The recording that proves where each claim-bearing tool carries its brief. @es La grabación que prueba dónde lleva su brief cada herramienta. */
const RECORDING_OF = { Agent: 'Agent', Task: 'Agent', SendMessage: 'SendMessage' };

let carriers;

try {
  ({ BRIEF_CARRIERS: carriers } = await import('./provenance.mjs'));
} catch (error) {
  report(false, `the decision module could not be loaded, so nothing ties the code to its wiring: ${error instanceof Error ? error.message : String(error)}`);
}

let declared;

try {
  const declaration = JSON.parse(readFileSync(DECLARATION, 'utf8'));
  const entry = declaration.registrations.find((registration) => registration.event === 'PreToolUse');

  declared = new Set(String(entry?.matcher ?? '').split('|').filter((tool) => tool.length > 0));
} catch (error) {
  report(false, `guard.mjs.hook-registration.json is missing or unreadable, so the fleet self-check cannot audit this guard: ${error instanceof Error ? error.message : String(error)}`);
}

if (carriers !== undefined && declared !== undefined) {
  const decided = Object.keys(carriers);

  for (const tool of decided) report(declared.has(tool), `the declaration registers ${tool}, which the decision reads a brief from`);

  for (const tool of declared) report(Object.hasOwn(carriers, tool), `the decision reads a brief from ${tool}, which the declaration registers`);

  for (const tool of decided) {
    const recording = RECORDING_OF[tool];

    if (recording === undefined) {
      report(false, `no recorded payload proves where ${tool} carries its brief`);
      continue;
    }

    const recorded = recordedPayload(recording);

    report(recorded.payload.tool_input[carriers[tool].field] === recorded.text, `${tool} reads tool_input.${carriers[tool].field}, the field its recording carries IN FULL`);
  }
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
