#!/usr/bin/env node
/**
 * Prueba de DISCRIMINACIÓN del guard de idioma del dueño sobre un espacio de estados CONSTRUIDO.
 *
 * Cada fixture se arma acá: ningún caso lee un transcript vivo, que cambia legítimamente y haría
 * enrojecer la prueba sin regresión. Los textos «reales» son copias literales de respuestas de la
 * sesión c45d798b, congeladas en este archivo.
 *
 * Capas, de adentro hacia afuera:
 *   1. `decide()`: los casos que el dueño exigió (deben pasar / deben bloquear), más los cercanos.
 *   2. `turnTextsFromLines()`: qué entra al turno y qué no (tool_use, thinking, sidechain, sintético,
 *      turno anterior, notificación como comienzo de turno).
 *   3. `readTurnTexts()`: un turno más grande que la ventana inicial, con texto multibyte, para que el
 *      corte en bytes y la ventana que se duplica queden ejercitados de verdad.
 *   4. `evaluate()`: con la forma del payload CAPTURADO del harness.
 *   5. El CLI como proceso, copiado a un directorio temporal para no ensuciar el diario real de
 *      rechazos: payload roto, inglés, español, transcript inexistente.
 *
 * Sale con 0 solo si todos los casos dan lo esperado.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { decide } from './decide.mjs';
import { evaluate } from './evaluate.mjs';
import { readTurnTexts, turnTextsFromLines } from './turn.mjs';

const HERE = import.meta.dirname;
const CAPTURED = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'stop-payload.captured.json'), 'utf8')).payload;

const results = [];

function check(name, actual, expected) {
  const ok = actual === expected;

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — esperado ${expected}, obtenido ${actual}`}`);
}

const blocks = (texts) => decide({ texts, stopHookActive: false }).block;

// ── 1. decide(): lo que DEBE pasar ─────────────────────────────────────────────────────────────────
const SPANISH = 'Listo, lo revisé de punta a punta y está todo en orden. El problema era que la ventana se cortaba antes del comienzo del turno, así que ahora se duplica hasta encontrarlo.';
const SPANISH_TECH = 'Hice el commit en la rama del worktree, corrí el selftest y el build, y el gate del pipeline quedó en verde. Después el cherry-pick sobre develop entró limpio, sin merge, y el token del registry sigue igual.';
const SPANISH_QUOTING = [
  'El agente terminó y su reporte dice textualmente:',
  '',
  '> The agent finished all tasks and the build is green. There is nothing left to do here.',
  '',
  'Y el log del gate quedó así:',
  '',
  '```',
  'Error: the file could not be found and the process will now exit with code 1',
  '```',
  '',
  'O sea que el mensaje «the process will now exit because it was not found» es del runner, y el reporte "all of this is done and it was verified by the tool" lo escribió el worker; `it is what it is and we have to move on` es un comentario del código. Lo verifiqué yo.'
].join('\n');
const MULTIBYTE = 'Añadí la corrección en el diseño: la señal de «sesión» ahora se lee después del año de configuración, y la función de migración está acá, niño. ¿Querés que lo revise también en pequeño? ¡Dale!';

check('pasa: español puro', blocks([SPANISH]), false);
check('pasa: español denso en jerga técnica inglesa', blocks([SPANISH_TECH]), false);
check('pasa: español que cita un log y un reporte en inglés', blocks([SPANISH_QUOTING]), false);
check('pasa: «Listo.»', blocks(['Listo.']), false);
check('pasa: multibyte con ñ y tildes', blocks([MULTIBYTE]), false);
check('pasa: turno vacío (sin textos)', blocks([]), false);
check('pasa: turno con un texto vacío', blocks(['']), false);
check('pasa: solo rutas, URLs e identificadores', blocks(['`~/.claude/settings.json` https://code.claude.com/docs/en/hooks readTurnTexts stop_hook_active C:\\Users\\x\\file.mjs']), false);
check(
  'pasa: tabla real en español que cita en cursiva un error en inglés (proporción medida 0,4)',
  blocks(['| sonda | resultado |\n|---|---|\n| `git ls-remote https://…` | **exit 128** — *Failed to connect to port 443 after 2071 ms* | la red está cortada y el proxy no responde |']),
  false
);

// ── 1. decide(): lo que DEBE bloquear ─────────────────────────────────────────────────────────────
const ENGLISH = 'The agent that protects our customizations from gentle-ai syncs has finished. I ran its selftest (46/46) and its check against the live files, and all of them passed.';
const MIXED = `${SPANISH}\n\nFour agents are still working on the remaining tasks, and I will tell you as each one of them lands on develop.\n\n${SPANISH_TECH}`;

check('bloquea: inglés puro (respuesta real de la sesión)', blocks([ENGLISH]), true);
check('bloquea: respuesta mixta con un párrafo de prosa en inglés', blocks([MIXED]), true);
check('bloquea: una sola línea de progreso entre herramientas', blocks([SPANISH, 'Running the real sync now.', SPANISH_TECH]), true);
check('bloquea: línea de progreso real más corta medida', blocks(['Retry right away with the markers.']), true);
check('bloquea: línea real con un solo marcador gramatical', blocks(['Valid and engram kept. Last: `~/.claude.json` changed — checking MCP servers survived:']), true);
check('bloquea: línea de progreso de dos palabras, una de ellas un verbo de progreso', blocks(['Checking it:']), true);
check('bloquea: inglés en markdown (negrita, viñetas)', blocks(['- **Done**: the build is green and it was merged into develop.\n- Next I will check the other two branches.']), true);

check('bloquea: inglés con una palabra española suelta (proporción 6 a 1)', blocks(['The función was renamed and the tests are still green.']), true);
check('bloquea: cláusula inglesa con apóstrofos tipográficos', blocks(['Bueno, I’m sure it’s fine.']), true);

// Cercanos: el mismo inglés, pero CITADO, no debe bloquear; y la re-entrada no debe volver a bloquear.
check('pasa: una sola palabra inglesa prestada sin marcadores españoles (límite declarado)', blocks(['Build verde, tests verdes, lint limpio: done.']), false);
check('pasa: español con cláusula inglesa corta y muchas tildes (proporción 3 a 6)', blocks(['Corrección aplicada: señal, sesión, diseño y migración — it was the one.']), false);
check('pasa: cita dominante entre comillas rectas', blocks(['Dijo "the build is green and all of the tests passed on the first run" y listo.']), false);
check('pasa: cita dominante entre comillas tipográficas', blocks(['Dijo “the build is green and all of the tests passed on the first run” y listo.']), false);
check('pasa: cita dominante en código en línea', blocks(['Dijo `the build is green and all of the tests passed on the first run` y listo.']), false);
check('pasa: el mismo párrafo inglés como cita en bloque', blocks([`Esto dijo el agente:\n\n> ${ENGLISH}`]), false);
check('pasa: el mismo párrafo inglés entre comillas latinas', blocks([`El agente reportó «${ENGLISH}» y lo verifiqué.`]), false);
check('pasa: stop_hook_active en true aunque haya inglés', decide({ texts: [ENGLISH], stopHookActive: true }).block, false);

const verdict = decide({ texts: [ENGLISH], stopHookActive: false });

check('el rechazo nombra el fragmento', verdict.reason.includes('The agent that protects'), true);
check('el rechazo pide reescribir en español rioplatense con tono Gentleman', verdict.reason.includes('español rioplatense') && verdict.reason.includes('Gentleman'), true);

// ── 2. turnTextsFromLines(): el corte del turno ───────────────────────────────────────────────────
const line = (entry) => JSON.stringify(entry);
const userPrompt = (text) => line({ type: 'user', isSidechain: false, message: { role: 'user', content: text } });
const toolResult = () => line({ type: 'user', isSidechain: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'The command finished and the file was written.' }] } });
const assistant = (blocksOf, extra = {}) => line({ type: 'assistant', isSidechain: false, message: { model: 'claude-opus-5-5', role: 'assistant', content: blocksOf }, ...extra });
const text = (value) => ({ type: 'text', text: value });

const turnOf = (lines) => blocks(turnTextsFromLines(lines).texts);

check(
  'turno: línea inglesa entre herramientas se juzga aunque el final sea español',
  turnOf([userPrompt('Dale'), assistant([text('Running the real sync now.'), { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]), toolResult(), assistant([text(SPANISH)])]),
  true
);
check(
  'turno: inglés en tool_use, thinking y tool_result NO cuenta',
  turnOf([
    userPrompt('Dale'),
    assistant([{ type: 'thinking', thinking: 'I should run the tests and then check what happened with the build.' }, { type: 'tool_use', id: 't1', name: 'Agent', input: { prompt: 'Build the thing and report what you found in the logs.' } }]),
    toolResult(),
    assistant([text(SPANISH)])
  ]),
  false
);
check('turno: el inglés del turno ANTERIOR no cuenta', turnOf([assistant([text(ENGLISH)]), userPrompt('Ahora en español, por favor'), assistant([text(SPANISH)])]), false);
check('turno: una notificación de tarea abre turno nuevo', turnOf([assistant([text(ENGLISH)]), userPrompt('<task-notification>The agent finished.</task-notification>'), assistant([text(SPANISH)])]), false);
check('turno: la respuesta a una notificación en inglés se juzga', turnOf([userPrompt('<task-notification>The agent finished.</task-notification>'), assistant([text(ENGLISH)])]), true);
check('turno: tráfico de subagente (sidechain) no cuenta', turnOf([userPrompt('Dale'), assistant([text(ENGLISH)], { isSidechain: true }), assistant([text(SPANISH)])]), false);
const API_ERROR = [text('API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.')];

check('turno: texto del modelo <synthetic> no cuenta', turnOf([userPrompt('Dale'), line({ type: 'assistant', isSidechain: false, message: { model: '<synthetic>', content: API_ERROR } })]), false);
check('turno: entrada marcada isApiErrorMessage no cuenta', turnOf([userPrompt('Dale'), assistant(API_ERROR, { isApiErrorMessage: true })]), false);
check('turno: un bloque que no es de tipo text no cuenta aunque traiga texto', turnOf([userPrompt('Dale'), assistant([{ type: 'citation', text: ENGLISH }])]), false);
check(
  'turno: un prompt de subagente (sidechain) no corta el turno',
  turnOf([userPrompt('Dale'), assistant([text(ENGLISH)]), line({ type: 'user', isSidechain: true, message: { role: 'user', content: 'Build it.' } }), assistant([text(SPANISH)])]),
  true
);
check('turno: una línea que no es JSON no rompe el corte', turnOf([userPrompt('Dale'), '{roto', assistant([text(ENGLISH)])]), true);
check('turno: sin comienzo visible devuelve complete=false', turnTextsFromLines([assistant([text(SPANISH)])]).complete, false);

// ── 3. readTurnTexts(): archivo real, turno más grande que la ventana inicial, multibyte ─────────────
const scratch = mkdtempSync(path.join(os.tmpdir(), 'owner-language-guard-'));

try {
  const bigSpanish = `${'Añadí la sesión, la señal y el diseño acá. '.repeat(400)}`;
  const filler = Array.from({ length: 150 }, () => assistant([text(bigSpanish)]));
  const bigTurn = [userPrompt('Arrancá'), assistant([text('Running the real sync now.')]), ...filler];
  const transcript = path.join(scratch, 'big.jsonl');

  writeFileSync(transcript, `${[assistant([text(ENGLISH)]), userPrompt('previo'), ...bigTurn].join('\n')}\n`, 'utf8');

  const bytes = readFileSync(transcript).length;
  const read = readTurnTexts(transcript);

  check(`archivo: el turno (${bytes} bytes) excede la ventana inicial de 1 MiB`, bytes > 1 << 20, true);
  check('archivo: la ventana se duplica hasta el comienzo del turno', read.complete, true);
  check('archivo: la línea inglesa del comienzo del turno grande se encuentra', blocks(read.texts), true);
  check('archivo: el inglés del turno previo queda fuera', read.texts.includes(ENGLISH), false);

  // ── 4. evaluate(): forma del payload CAPTURADO ─────────────────────────────────────────────────
  const smallTranscript = path.join(scratch, 'small.jsonl');

  writeFileSync(smallTranscript, `${[userPrompt('Dale'), assistant([text(SPANISH)])].join('\n')}\n`, 'utf8');

  const payload = (overrides) => ({ ...CAPTURED, transcript_path: smallTranscript, last_assistant_message: SPANISH, ...overrides });

  check('evaluate: payload capturado en español pasa', evaluate(payload({})).verdict.block, false);
  check('evaluate: last_assistant_message en inglés aún no volcado al transcript bloquea', evaluate(payload({ last_assistant_message: ENGLISH })).verdict.block, true);
  check('evaluate: stop_hook_active true deja pasar', evaluate(payload({ stop_hook_active: true, last_assistant_message: ENGLISH })).verdict.block, false);
  check('evaluate: SubagentStop no se juzga', evaluate(payload({ hook_event_name: 'SubagentStop', last_assistant_message: ENGLISH })).verdict.block, false);
  check('evaluate: sin hook_event_name deja pasar y lo registra', evaluate(payload({ hook_event_name: undefined, last_assistant_message: ENGLISH })).problems.length, 1);
  check('evaluate: transcript inexistente juzga el último mensaje', evaluate(payload({ transcript_path: path.join(scratch, 'nope.jsonl'), last_assistant_message: ENGLISH })).verdict.block, true);
  check('evaluate: transcript inexistente queda registrado como problema', evaluate(payload({ transcript_path: path.join(scratch, 'nope.jsonl') })).problems.length, 1);

  // ── 5. el CLI como proceso, en una copia aislada ─────────────────────────────────────────────────
  const copy = path.join(scratch, 'guard-copy');

  mkdirSync(copy);

  for (const file of ['guard.mjs', 'evaluate.mjs', 'decide.mjs', 'language.mjs', 'prose.mjs', 'turn.mjs']) copyFileSync(path.join(HERE, file), path.join(copy, file));

  const run = (stdin) => spawnSync(process.execPath, [path.join(copy, 'guard.mjs')], { input: stdin, encoding: 'utf8' });

  const broken = run('{esto no es json');
  check('cli: payload roto sale con 0', broken.status, 0);
  check('cli: payload roto no bloquea', broken.stdout, '');
  check('cli: payload roto deja una línea en el log', readFileSync(path.join(copy, 'state', 'guard.log'), 'utf8').includes('payload ilegible'), true);

  const english = run(JSON.stringify(payload({ last_assistant_message: ENGLISH })));
  check('cli: inglés sale con 0', english.status, 0);
  check('cli: inglés emite decision block', JSON.parse(english.stdout || '{}').decision, 'block');
  check('cli: inglés queda en el diario de rechazos de la copia', readFileSync(path.join(copy, 'state', 'refusals.jsonl'), 'utf8').includes('The agent that protects'), true);

  const spanish = run(`\ufeff${JSON.stringify(payload({}))}`);
  check('cli: español con BOM sale con 0', spanish.status, 0);
  check('cli: español no bloquea', spanish.stdout, '');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} casos en verde`);
process.exit(failed === 0 ? 0 : 1);
