#!/usr/bin/env node
/**
 * Self-test for the brief-audience guard.
 *
 * It exercises the DECISION's state space, not merely that the guard fires. Two faces matter most:
 *
 *   - the FALSE POSITIVE: this project's briefs quote the owner's Spanish directives verbatim, and every
 *     report about the #6 incident quotes the leaked tag itself. A guard that refused those would be
 *     switched off within the day, so quotation (inline code, fences) is exercised in both directions,
 *     and so is the one measured decider false positive ("your call" delegating a choice TO a worker).
 *   - the REAL LEAKS, in the shapes the census of 504 transcripts found them (`audience.mjs`): a closing
 *     parameter tag plus the call's own closing tag at the end of a prompt, a message or a saved memory,
 *     and a TaskCreate subject that swallowed the next parameter.
 *
 * EVERY PAYLOAD HAS THE SHAPE THE HARNESS SENDS (`~/.claude/hook-payloads/`: SendMessage and mem_save
 * CAPTURED live; Agent, TaskCreate and TaskUpdate constructed from real calls). And the wiring is part of
 * the proof: the tools the decision reads are exactly the tools the registration declaration names.
 *
 * @es Auto-test del guard. Importan dos caras: el FALSO POSITIVO (citas en español, citas de la propia
 * etiqueta filtrada, y el «your call» medido que delega en el worker) y las FUGAS REALES en las formas que
 * halló el censo. Payloads con forma del harness y cableado como parte de la prueba.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const { payloadFor } = await import(pathToFileURL(join(HERE, '..', 'hook-payloads', 'payloads.mjs')).href);

const SESSION = 'selftest';
const as = (tool, text, options = {}) => JSON.stringify(payloadFor(tool, text, { sessionId: SESSION, ...options }));
const agent = (text) => as('Agent', text);
const task = (text) => as('Agent', text, { toolName: 'Task' });
const resume = (text) => as('SendMessage', text);
const memory = (text, input) => as('mcp__plugin_engram_engram__mem_save', text, { input });
const legacyMemory = (text) => as('mcp__plugin_engram_engram__mem_save', text, { toolName: 'mcp__engram__mem_save' });
const taskCreate = (text, input) => as('TaskCreate', text, { input });
const taskUpdate = (text) => as('TaskUpdate', text);

const BODY = `${'Measure the store and report what you find. '.repeat(30)}`;
const CLOSE = 'Commit on your worktree branch, conventional commits, verify with the real full gate set, and report the shas.';

// The measured decider leak, reproduced in the shape it arrived in.
const REAL_LEAK = [
  'El máximo listón es contrato, en los tres sitios, con 34 anclas de paridad verdes.',
  '',
  'Cuatro agentes vivos. sdd-tasks lanzado, con las dos cifras que cambian la forma de la lista.',
  '',
  'Sobre el ledger: tres tareas que dábamos por cerradas —#89, #127, #129— han vuelto al backlog.',
  '¿Las lanzo, o las quieres ver primero?'
].join('\n');

const cases = [
  // ---------------------------------------------------------------------------------------------
  // ALLOWED. These outnumber the refusals on purpose: a false positive kills this guard.
  // ---------------------------------------------------------------------------------------------
  ['allow', agent(`${BODY}\n\n${CLOSE}`), 'an ordinary brief that ends by instructing the worker'],
  ['allow', agent(`OWNER DIRECTIVE, verbatim: «¿Quieres que se haga lo mejor posible? Sí — hazlo con el máximo listón.» ${BODY}\n\n${CLOSE}`), 'THE ONE THAT MATTERS — an owner directive quoted in the BODY'],
  ['allow', agent(`${BODY}\n\nDime si algo no cuadra — that phrase is here in the BODY.\n\n${BODY}\n\n${CLOSE}`), 'a decider phrase far from the tail is untouched'],
  ['allow', agent(`${BODY}\n\nReport what you measured, what you did, and the honest gap. State the shas.`), 'a closing paragraph full of imperatives'],
  ['allow', agent(`${BODY}\n\nIf the evidence contradicts my premise, say so with the receipt rather than deferring.`), 'a conditional addressed TO the worker'],
  ['allow', resume(`${BODY}\n\nCommit the correction as its own clean commit (or amend if you have not moved past that chunk — your call, but keep history clean). Report back the same way.`), 'REAL FALSE POSITIVE (census): "your call" delegates a choice TO the worker'],
  ['allow', resume(`${BODY}\n\nShall I proceed? — quoted from the owner, for context.`), 'SendMessage carries no decider-tail check: the census found 0 true hits and 1 false one there'],
  ['allow', resume(`${BODY}\n\nQuote the leaked \`</parameter><parameter name="activeForm">\` fragment location.`), 'NEAR MISS: the leaked tag QUOTED in inline code — writing about the incident is data'],
  ['allow', memory(`**What**: the leak looked like\n\`\`\`\n…is itself debt.</parameter>\n<parameter name="activeForm">Closing\n\`\`\`\n**Learned**: close every call first.`), 'the leaked tag QUOTED in a fenced block inside a saved memory'],
  ['allow', taskCreate(`## Leak\n\nThe record stores \`</parameter>\` where activeForm should be. Fix the writer.`), 'a task description quoting the tag in inline code'],
  ['allow', as('Bash', 'rg "</parameter>" ~/.claude/tasks'), 'not a carrier: a search for the tag is not writing it'],
  ['allow', JSON.stringify({ ...payloadFor('Agent', '', { sessionId: SESSION }), tool_input: {} }), 'no prompt at all'],
  ['allow', agent('   \n  '), 'whitespace-only prompt'],

  // ---------------------------------------------------------------------------------------------
  // REFUSED — decider question at a brief's end (Agent/Task, the measured incident).
  // ---------------------------------------------------------------------------------------------
  ['deny', agent(`${BODY}\n\n${CLOSE}\n\n${REAL_LEAK}`), 'THE REAL CASE: the measured decider leak appended after a valid brief', 'addressing someone who is not'],
  ['deny', agent(`${BODY}\n\n¿Procedo con la descomposición?`), 'a bare permission question at the end'],
  ['deny', task(`${BODY}\n\nShall I proceed, or do you want to see it first?`), 'the English form, on the Task alias'],
  ['deny', agent(`${BODY}\n\nDo you want me to launch the remaining three?`), 'asking the decider what to launch'],

  // ---------------------------------------------------------------------------------------------
  // REFUSED — bare tool-call markup, in the shapes the census found, on every carrier.
  // ---------------------------------------------------------------------------------------------
  ['deny', taskCreate('Closing rounds that a mechanism known to report false closures is itself debt.</parameter>\n<parameter name="activeForm">Closing the ledger\'s false-CLOSED defect'), 'THE #6 RECORD: TaskCreate description swallowed the activeForm parameter', 'TaskCreate.description'],
  ['deny', taskCreate('A real description.', { subject: 'Stash triage decided by content</subject>\n<parameter name="description">DONE. Registered as' }), 'REAL SHAPE: a TaskCreate subject that swallowed the description', 'TaskCreate.subject'],
  ['deny', taskUpdate('lie.</description>\n<activeForm>Running the full pipeline</activeForm>\n</invoke>\n'), 'REAL SHAPE: TaskUpdate description ending in the call\'s closing tag'],
  ['deny', agent(`${BODY}\n\nReport the sha so I can cherry-pick it. Never commit on develop.</prompt>\n</invoke>\n`), 'REAL SHAPE: an Agent prompt ending in its own closing tags (22 in the census)', '</invoke>'],
  ['deny', resume(`${BODY}\n\nReport the sha and the honest gate result when it lands.</message>\n</invoke>\n`), 'REAL SHAPE: a SendMessage ending in its own closing tags (16 in the census)', 'SendMessage.message'],
  ['deny', memory('**What**: a suffix heuristic passes today and starts lying later.</content>\n</invoke>\n'), 'REAL SHAPE: a saved memory ending in its closing tags'],
  ['deny', legacyMemory('**What**: measured 0</content>\n<parameter name="tags">coverage,vitest</parameter>'), 'REAL SHAPE: the older engram tool name, with a swallowed tags parameter'],
  ['deny', memory('A real content.', { title: 'Coverage floors</title>\n<parameter name="type">decision' }), 'a saved memory TITLE carrying the markup'],
  ['deny', resume(`${BODY}\n\nOne backtick \` opened and never closed, then </parameter> leaks.`), 'NEAR MISS: an unbalanced backtick does not hide a tag that follows the closed span'],
  ['deny', taskCreate('A real description.', { activeForm: 'Running the gates</parameter>' }), 'TaskCreate.activeForm carrying the markup', 'TaskCreate.activeForm'],
  ['deny', as('TaskUpdate', 'A real description.', { input: { subject: 'Closing</parameter>' } }), 'TaskUpdate.subject carrying the markup', 'TaskUpdate.subject'],
  ['deny', as('TaskUpdate', 'A real description.', { input: { activeForm: 'Closing</parameter>' } }), 'TaskUpdate.activeForm carrying the markup', 'TaskUpdate.activeForm'],
  ['deny', as('mcp__plugin_engram_engram__mem_save', 'Real content.', { toolName: 'mcp__engram__mem_save', input: { title: 'Floors</title>\n<invoke name="x">' } }), 'the older engram tool name: a title carrying the markup', 'mcp__engram__mem_save.title'],
  ['deny', resume(`${BODY}\n\nA swallowed parameter opens like <parameter name="activeForm"> here.`), 'a bare parameter OPENING tag alone', '<parameter name='],
  ['deny', resume(`${BODY}\n\nA swallowed call opens like <invoke name="SendMessage"> here.`), 'a bare invoke OPENING tag alone', '<invoke name='],
  ['deny', resume(`${BODY}\n\nQuoted \`</parameter>\` first, and then the same </parameter> bare on one line, then \`code\`.`), 'NEAR MISS: a quoted tag does not hide the same tag bare later on its line'],
  ['deny', agent('Do it now. ¿Procedo?'), 'the refusal states the real tail length of a short brief', 'last 20 characters'],
  ['deny', resume(`${BODY}\n\n\`\`\`\n</parameter>\n\`\`\`\nThe fence is closed now, so this </parameter> is bare.`), 'NEAR MISS: a closed fence stops quoting what follows it'],
  ['allow', resume(`${BODY}\n\n~~~\n</parameter>\n~~~\nThe tilde fence quotes the tag above.`), 'a tilde-fenced quotation passes'],
  ['allow', resume(`${BODY}\n\n   \`\`\`\n   </parameter>\n   \`\`\`\nAn indented fence quotes the tag above.`), 'an indented fence quotes too'],
  ['deny', agent(`${BODY}\n\n¿Procedo con la descomposición? ${'Then report the shas. '.repeat(27)}`), 'a decider phrase about 600 characters from the end is still in the tail'],

  // ---------------------------------------------------------------------------------------------
  // FAIL-OPEN: every malfunction of its own must let the call run.
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
  const textOk = expectedText === undefined || output.includes(expectedText);

  report(actual === expected && code === 0 && textOk, `expected=${expected} actual=${actual} exit=${code}  ${label}${textOk ? '' : `  [the refusal never named: ${expectedText}]`}`);
}

// --- THE WIRING: the tools the decision reads are exactly the tools the declaration registers.
let carriers;

try {
  ({ CARRIERS: carriers } = await import('./audience.mjs'));
} catch (error) {
  report(false, `the decision module could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const declaration = JSON.parse(readFileSync(join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const declared = new Set(String(declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher ?? '').split('|'));

  if (carriers !== undefined) {
    for (const tool of Object.keys(carriers)) report(declared.has(tool), `the declaration registers ${tool}, which the decision reads`);

    for (const tool of declared) report(Object.hasOwn(carriers, tool), `the decision reads ${tool}, which the declaration registers`);
  }
} catch (error) {
  report(false, `the registration declaration is unreadable: ${error instanceof Error ? error.message : String(error)}`);
}

// --- THE PHRASE LIST, pinned literally: each phrase is one decision, and reading the list back from the
//     module under test could never notice a phrase leaving it.
// @es La lista de frases, fijada a mano: cada frase es una decisión y leerla del propio módulo no notaría que una sale.
const PINNED_PHRASES = [
  '¿las lanzo', '¿lo lanzo', '¿las quieres', '¿lo quieres', '¿quieres que', '¿te parece', '¿sigo con', '¿procedo', '¿lo hago', 'dime si',
  'dime qué prefieres', 'tú decides', 'es tuyo decidir', 'shall i launch', 'shall i proceed', 'do you want me to', 'would you prefer', 'let me know if you', 'up to you'
];

if (carriers !== undefined) {
  const { deciderPhrases, DECIDER_PHRASES } = await import('./audience.mjs');

  for (const phrase of PINNED_PHRASES) report(deciderPhrases(`${BODY}\n\n${phrase.toUpperCase()}`).includes(phrase), `the tail check recognises "${phrase}"`);

  report(DECIDER_PHRASES.length === PINNED_PHRASES.length, `the module lists exactly the ${PINNED_PHRASES.length} pinned phrases (it lists ${DECIDER_PHRASES.length})`);
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
