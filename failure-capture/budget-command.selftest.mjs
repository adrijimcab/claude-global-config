#!/usr/bin/env node
/**
 * Proof of the `budget` command of `capture.mjs` and of its report (`budget-report.mjs`): on constructed homes
 * and projects it runs the real command and asserts the exact exit status and the exact report lines. States:
 * within the global ceiling; over it; over a stricter project ceiling although the global one holds; an
 * invalid project configuration; a missing import shown under its own heading without touching the exit; a
 * file over the harness per-file limit reported without deciding; a project directory that does not exist.
 *
 * @es Prueba del comando `budget` de `capture.mjs` y de su informe (`budget-report.mjs`): sobre homes y
 * proyectos construidos ejecuta el comando real y afirma el estado de salida y las líneas exactas del
 * informe. Estados: dentro del techo global; sobre él; sobre un techo de proyecto más estricto aunque el
 * global se cumpla; configuración de proyecto inválida; un import ausente bajo su propio encabezado sin
 * tocar la salida; un fichero sobre el límite por fichero del harness, informado sin decidir; un directorio
 * de proyecto que no existe.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CAPTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'capture.mjs');
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'budget-command-selftest-')));
let passed = 0;
let worlds = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** A home and a project holding `homeText` and `projectText` as their instruction files, plus `extra` files. @es Un home y un proyecto con sus ficheros de instrucciones, más `extra`. */
function world({ homeText, projectText, config, extra = {} }) {
  worlds += 1;

  const root = path.join(scratch, `w${worlds}`);
  const files = { 'home/.claude/CLAUDE.md': homeText, 'proj/.claude/CLAUDE.md': projectText, ...extra };

  if (config !== undefined) files['proj/.claude/failure-capture.json'] = config;

  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  }

  return { home: path.join(root, 'home'), project: path.join(root, 'proj') };
}

/** Runs `budget` with the world's home, walking no higher than the scratch directory (the real home is an ancestor of the temp directory); `{ status, out, err }`. @es Ejecuta `budget` con el home del mundo, sin subir más que el directorio temporal (el home real es ancestro del temporal). */
function budget(target, args = [], cwd = target.project) {
  const answer = spawnSync(process.execPath, [CAPTURE, 'budget', ...args, '--ceiling', scratch], { cwd, encoding: 'utf8', env: { ...process.env, HOME: target.home, USERPROFILE: target.home }, timeout: 60_000 });

  return { status: answer.status, out: answer.stdout.split('\n'), err: answer.stderr };
}

const ES_FILES = 'files by weight, raw / counted. @es ficheros por peso, bruto / contado.';
const homeFile = (target) => path.join(target.home, '.claude', 'CLAUDE.md');
const projectFile = (target) => path.join(target.project, '.claude', 'CLAUDE.md');

try {
  // --- within the global ceiling
  const within = world({ homeText: 'h'.repeat(1000), projectText: 'p'.repeat(500) });
  const ran = budget(within);

  check('within: exit 0', ran.status, 0);
  check('within: the exact report', ran.out, [
    'budget WITHIN: 1,500 raw characters (harness-counted 1,500) against 147,000 (global ceiling), margin 145,500. @es presupuesto DENTRO: 1,500 caracteres brutos (contados por el harness 1,500) frente a 147,000 (techo global), margen 145,500.',
    ES_FILES,
    `  1,000 / 1,000  ${homeFile(within)}`,
    `  500 / 500  ${projectFile(within)}`,
    ''
  ]);
  check('the project may be named with --project from another directory', budget(within, ['--project', within.project], within.home).out, ran.out);

  // --- over the global ceiling (and raw decides while the harness count is lower)
  const over = world({ homeText: `<!--\n${'c'.repeat(100)}\n-->\n${'h'.repeat(146_000)}`, projectText: 'p'.repeat(950) });
  const overRan = budget(over);

  check('over the global ceiling: exit 1', overRan.status, 1);
  check('over: the verdict line carries raw, counted, ceiling, source and negative margin', overRan.out[0], 'budget OVER: 147,060 raw characters (harness-counted 146,950) against 147,000 (global ceiling), margin -60. @es presupuesto EXCEDIDO: 147,060 caracteres brutos (contados por el harness 146,950) frente a 147,000 (techo global), margen -60.');
  check('over: the heaviest file comes first', overRan.out[2], `  146,110 / 146,000  ${homeFile(over)}`);

  // --- a stricter project ceiling decides
  const strict = world({ homeText: 'h'.repeat(1000), projectText: 'p'.repeat(500), config: JSON.stringify({ loadedSetCeiling: 1499 }) });
  const strictRan = budget(strict);

  check('over a stricter project ceiling: exit 1', strictRan.status, 1);
  check('the project ceiling is named as the deciding one', strictRan.out[0], 'budget OVER: 1,500 raw characters (harness-counted 1,500) against 1,499 (project ceiling), margin -1. @es presupuesto EXCEDIDO: 1,500 caracteres brutos (contados por el harness 1,500) frente a 1,499 (techo del proyecto), margen -1.');
  check('a project ceiling exactly met is within', budget(world({ homeText: 'h'.repeat(1000), projectText: 'p'.repeat(500), config: JSON.stringify({ loadedSetCeiling: 1500 }) })).status, 0);

  // --- a file over the harness per-file limit is reported, not decided on
  const fat = world({ homeText: 'h'.repeat(40_001), projectText: 'p'.repeat(40_000) });
  const fatRan = budget(fat);

  check('an over-limit file does not change the exit', fatRan.status, 0);
  check('the over-limit file is reported under its heading, the file at the limit is not', fatRan.out.slice(4), [
    'over the harness per-file limit of 40,000 (reported, not decided on). @es sobre el límite por fichero del harness de 40,000 (se informa, no decide).',
    `  40,001  ${homeFile(fat)}`,
    ''
  ]);

  // --- a missing import is informational
  const gap = world({ homeText: 'h'.repeat(10), projectText: `@gone.md\n${'p'.repeat(10)}` });
  const gapRan = budget(gap);

  check('a missing import does not change the exit', gapRan.status, 0);
  check('a missing import is listed under its own informational heading', gapRan.out.slice(4), [
    'missing imports (informational: the harness makes the same lookups; not part of the verdict). @es imports ausentes (informativo: el harness hace las mismas búsquedas; no forman parte del veredicto).',
    `  ${path.join(gap.project, '.claude', 'gone.md')} (imported by ${projectFile(gap)})`,
    ''
  ]);
  check('no heading appears when nothing is over the limit or missing', ran.out.some((line) => line.startsWith('over the') || line.startsWith('missing')), false);

  // --- not measured
  const broken = world({ homeText: 'h', projectText: 'p', config: JSON.stringify({ loadedSetCeiling: 0 }) });
  const brokenRan = budget(broken, ['--project', broken.project], within.project);

  check('an invalid project configuration is exit 2', brokenRan.status, 2);
  check('it says NOT MEASURED, bilingual, and names the cause', brokenRan.err.startsWith('budget NOT MEASURED. @es presupuesto NO MEDIDO.\n') && brokenRan.err.includes('"loadedSetCeiling" must be a positive integer'), true);
  check('nothing is printed as a verdict when it is not measured', brokenRan.out, ['']);

  const missingProject = budget(within, ['--project', path.join(scratch, 'nowhere')]);

  check('a project directory that does not exist is exit 2', missingProject.status, 2);
  check('...and names it', missingProject.err.includes('does not exist. @es') && missingProject.err.includes('nowhere'), true);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

process.stdout.write(`failure-capture budget-command selftest: ${passed} passed, ${failures.length} failed\n`);
for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
