#!/usr/bin/env node
/**
 * Proof of the budget advisory that follows a capture (`budget-advisory.mjs` wired in `capture.mjs`): when the
 * loaded instruction set is over its ceiling the capture prints the verdict and the heaviest files, then
 * condenses in process the ledger lines that need no operator input; within the ceiling it prints nothing.
 * The exit status of a capture is never changed by the budget, and any failure of the advisory is printed and
 * swallowed. The command cases run the real `capture.mjs` on constructed homes and projects, walking no
 * higher than the scratch directory; the failure cases drive the module with injected steps, because a
 * measuring failure cannot be built from a fixture portably.
 *
 * @es Prueba del aviso de presupuesto que sigue a una captura (`budget-advisory.mjs` cableado en
 * `capture.mjs`): si el conjunto de instrucciones cargado supera su techo, la captura imprime el veredicto y
 * los ficheros más pesados y luego condensa en proceso las líneas del ledger que no necesitan operador; dentro
 * del techo no imprime nada. El presupuesto nunca cambia el estado de salida de una captura y cualquier fallo
 * del aviso se imprime y se traga. Los casos del comando ejecutan el `capture.mjs` real sobre homes y
 * proyectos construidos, sin subir más que el directorio temporal; los de fallo manejan el módulo con pasos
 * inyectados, porque un fallo de medición no se puede construir de forma portable desde un fixture.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { adviseOnBudget } from './budget-advisory.mjs';
import { KEYED, PROJECT_LINE, SHORT_KEYED, SHORT_PROJECT } from './condense-fixtures.mjs';
import { holdsWholeLine } from './conservation.mjs';
import { HEADER, PROJECT_LOADER } from './ledgers.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'budget-advisory-selftest-')));
let passed = 0;
let worlds = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const readOr = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

/** A repository holding a copy of the loop, a home with a ledger holding `KEYED` and a 600-character instruction file. @es Un repositorio con copia del loop y un home con un ledger y un fichero de instrucciones de 600 caracteres. */
function world({ config, projectLedger } = {}) {
  worlds += 1;

  const root = path.join(scratch, `w${worlds}`);
  const repo = path.join(root, 'repo');
  const home = path.join(root, 'home');
  const loop = path.join(repo, '.claude', 'failure-capture');

  mkdirSync(path.join(loop, 'state'), { recursive: true });
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  provisionLoop(loop);
  writeFileSync(path.join(repo, '.claude', 'CLAUDE.md'), '# Project\n');
  writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'h'.repeat(600));
  mkdirSync(path.join(home, '.claude', 'rules'), { recursive: true });
  writeFileSync(path.join(home, '.claude', 'rules', 'promoted-rules.md'), HAND_WRITTEN);
  writeFileSync(path.join(home, '.claude', 'lessons-ledger.md'), `${HEADER('global', '`x`')}${KEYED}\n`);
  if (config !== undefined) writeFileSync(path.join(repo, '.claude', 'failure-capture.json'), JSON.stringify(config));
  if (projectLedger !== undefined) writeFileSync(path.join(repo, '.claude', 'lessons-ledger.md'), `${HEADER(config.scope, PROJECT_LOADER)}${projectLedger}\n`);

  return { repo, home, loop, ledger: path.join(home, '.claude', 'lessons-ledger.md'), projectLedger: path.join(repo, '.claude', 'lessons-ledger.md'), evidence: (key) => path.join(home, '.claude', 'lessons', 'evidence', `${key}.md`) };
}

const HAND_WRITTEN = '# promoted\n';
const LESSON ='A constructed lesson about the advisory -> root cause -> RULE: measure the set after every capture.';

/** Captures one lesson in a world; `{ status, out, err }`. @es Captura una lección en un mundo. */
function capture(target, extra = ['--key', 'fresh-lesson-key', '--scope', 'global', '--actor', 'orchestrator', '--lesson', LESSON]) {
  const answer = spawnSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'capture', ...extra, '--ceiling', scratch], { cwd: target.repo, encoding: 'utf8', env: worldEnv(target.home, { loop: target.loop }), timeout: 120_000 });

  return { status: answer.status, out: answer.stdout.split('\n'), err: answer.stderr };
}

const OVER = { loadedSetCeiling: 500 };
const homeFile = (target) => path.join(target.home, '.claude', 'CLAUDE.md');
const projectFile = (target) => path.join(target.repo, '.claude', 'CLAUDE.md');

try {
  // --- within the ceiling: nothing is printed, nothing is condensed
  const within = world();
  const quiet = capture(within);

  check('within: the capture exits 0 and records its line', [quiet.status, readOr(within.ledger).includes('<!--fc:fresh-lesson-key#1-->')], [0, true]);
  check('within: no advisory is printed', quiet.out.some((line) => line.includes('ADVISORY')), false);
  check('within: the existing fat line is left as it was', readOr(within.ledger).split('\n').includes(KEYED), true);

  // --- over the ceiling: the advisory, then the condense, and the exit is unchanged
  const over = world({ config: OVER });
  const loud = capture(over);
  const start = loud.out.findIndex((line) => line.startsWith('ADVISORY'));

  check('over: the capture still exits 0', loud.status, 0);
  check('over: the advisory names the verdict and the heaviest files, exactly', loud.out.slice(start, start + 7), [
    'ADVISORY — the always-loaded instruction set is over its ceiling. @es AVISO: el conjunto de instrucciones siempre cargado supera su techo.',
    'budget OVER: 621 raw characters (harness-counted 621) against 500 (project ceiling), margin -121. @es presupuesto EXCEDIDO: 621 caracteres brutos (contados por el harness 621) frente a 500 (techo del proyecto), margen -121.',
    'heaviest files, raw / counted. @es ficheros más pesados, bruto / contado.',
    `  600 / 600  ${homeFile(over)}`,
    `  11 / 11  ${path.join(over.home, '.claude', 'rules', 'promoted-rules.md')}`,
    `  10 / 10  ${projectFile(over)}`,
    'condensing the ledger lines that need no operator input. @es condensando las líneas del ledger que no necesitan intervención del operador.'
  ]);
  check('over: the advisory comes after the capture report', start > loud.out.findIndex((line) => line.startsWith('RECORDED')), true);
  check('over: what the condense did is printed', loud.out.some((line) => line.startsWith('global ledger') && line.includes('shortened')), true);
  check('over: the eligible line was condensed, its original archived whole', [readOr(over.ledger).split('\n').includes(SHORT_KEYED), holdsWholeLine(readOr(over.evidence('signal-lesson')), KEYED)], [true, true]);
  check('over: the hand-written promoted rules are never written', readOr(path.join(over.home, '.claude', 'rules', 'promoted-rules.md')), HAND_WRITTEN);
  check('over: the capture\'s own line is recorded', readOr(over.ledger).includes('<!--fc:fresh-lesson-key#1-->'), true);

  // --- the condense fails: printed, the capture's line stays, the exit is unchanged
  const broken = world({ config: OVER });

  mkdirSync(broken.evidence('signal-lesson'), { recursive: true });

  const failed = capture(broken);

  check('a failing condense leaves the exit at 0', failed.status, 0);
  check('...prints the advisory and what it could not do', [failed.out.some((line) => line.startsWith('ADVISORY')), failed.out.some((line) => line.includes('left unchanged'))], [true, true]);
  check('...keeps the line it could not prove byte-identical and the capture recorded', [readOr(broken.ledger).split('\n').includes(KEYED), readOr(broken.ledger).includes('<!--fc:fresh-lesson-key#1-->')], [true, true]);

  // --- a capture into a project scope condenses ONLY that project's ledger; a global capture condenses both
  const PROJECT_OVER = { scope: 'b100-am-ui', loadedSetCeiling: 500 };
  const scoped = world({ config: PROJECT_OVER, projectLedger: PROJECT_LINE });
  const scopedRun = capture(scoped, ['--key', 'fresh-lesson-key', '--scope', 'b100-am-ui', '--actor', 'orchestrator', '--lesson', LESSON]);

  check('scoped: the capture exits 0 over the ceiling and the advisory runs', [scopedRun.status, scopedRun.out.some((line) => line.startsWith('ADVISORY'))], [0, true]);
  check('scoped: the project ledger is condensed and holds the capture', [readOr(scoped.projectLedger).split('\n').includes(SHORT_PROJECT), readOr(scoped.projectLedger).includes('<!--fc:fresh-lesson-key#1-->')], [true, true]);
  check('scoped: the GLOBAL ledger is left byte for byte as it was', readOr(scoped.ledger), `${HEADER('global', '`x`')}${KEYED}\n`);
  check('scoped: the report names the project ledger only', [scopedRun.out.some((line) => line.startsWith('b100-am-ui ledger') && line.includes('shortened')), scopedRun.out.some((line) => line.startsWith('global ledger'))], [true, false]);

  const everywhere = world({ config: PROJECT_OVER, projectLedger: PROJECT_LINE });

  capture(everywhere);
  check("a GLOBAL capture still condenses every ledger, the project's too", [readOr(everywhere.ledger).split('\n').includes(SHORT_KEYED), readOr(everywhere.projectLedger).split('\n').includes(SHORT_PROJECT)], [true, true]);

  // --- a refused capture measures nothing
  const refused = capture(world({ config: OVER }), ['--key', 'x']);

  check('a refused capture exits 1 with no advisory', [refused.status, refused.out.some((line) => line.includes('ADVISORY'))], [1, false]);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// --- the module, with injected steps
const OVER_VERDICT = { status: 'over', source: 'global', ceiling: 500, margin: -1, rawTotal: 501, countedTotal: 501, files: [], overPerFile: [] };
const WITHIN_VERDICT = { ...OVER_VERDICT, status: 'within', margin: 0, rawTotal: 500, countedTotal: 500 };

function advise(steps) {
  const printed = [];
  const calls = [];

  // `escaped` is what got out of the advisory: the proof asserts on it, so a step that is NOT swallowed fails a
  // check instead of crashing the selftest where no check decides it.
  // @es `escaped` es lo que salió del aviso: la prueba lo afirma, así que un paso que NO se traga falla un check
  // en vez de hacer caer el selftest donde ningún check decide.
  let escaped;

  try {
    adviseOnBudget({ measure: steps.measure, condense: () => { calls.push('condense'); return steps.condense(); }, print: (line) => printed.push(line) });
  } catch (error) {
    escaped = error instanceof Error ? error.message : String(error);
  }

  return { printed, calls, escaped };
}

const condensed = advise({ measure: () => WITHIN_VERDICT, condense: () => ['never'] });

check('within: nothing is printed and nothing is condensed', [condensed.printed, condensed.calls], [[], []]);

const measuringFails = advise({ measure: () => { throw new Error('the set cannot be read'); }, condense: () => ['never'] });

check('a measuring failure is printed, bilingual, and swallowed; nothing is condensed', [measuringFails.printed, measuringFails.calls], [['budget advisory FAILED (the capture itself is unaffected): the set cannot be read. @es el aviso de presupuesto FALLÓ (la captura no se ve afectada): the set cannot be read.'], []]);

const condenseFails = advise({ measure: () => OVER_VERDICT, condense: () => { throw new Error('disk full'); } });

check('a throwing condense is printed after the advisory and swallowed', [condenseFails.printed.length, condenseFails.printed.at(-1), condenseFails.calls], [4,'budget advisory FAILED (the capture itself is unaffected): disk full. @es el aviso de presupuesto FALLÓ (la captura no se ve afectada): disk full.', ['condense']]);

const notAnError = advise({ measure: () => { throw 'plain text'; }, condense: () => [] });

check('a thrown value that is not an Error is reported by its text', notAnError.printed, ['budget advisory FAILED (the capture itself is unaffected): plain text. @es el aviso de presupuesto FALLÓ (la captura no se ve afectada): plain text.']);

check('no failing step escapes the advisory: a thrown measure, condense or plain value is swallowed', [measuringFails.escaped, condenseFails.escaped, notAnError.escaped], [undefined, undefined, undefined]);

const five = ['a', 'b', 'c', 'd', 'e'].map((name, index) => ({ path: name, raw: 50 - index, counted: 50 - index }));
const listed = advise({ measure: () => ({ ...OVER_VERDICT, files: five }), condense: () => ['did it'] });

check('the advisory lists the three heaviest files only, then what the condense did', listed.printed.slice(2), ['heaviest files, raw / counted. @es ficheros más pesados, bruto / contado.', '  50 / 50  a', '  49 / 49  b', '  48 / 48  c', 'condensing the ledger lines that need no operator input. @es condensando las líneas del ledger que no necesitan intervención del operador.', 'did it']);

process.stdout.write(`failure-capture budget-advisory selftest: ${passed} passed, ${failures.length} failed\n`);
for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
