#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `baseline-record/budget.mjs`, the raw size of the always-loaded sets. Every case
 * runs a CONSTRUCTED stand-in for `capture.mjs budget` (a script that prints a chosen report, exits with a
 * chosen code and logs how it was called), never the real one.
 *
 * THE STATE SPACE: the report parser (figures, file rows, the per-file-limit section that must not be read
 * as files, thousands separators, Windows line endings, a report without figures), the exit codes (0 within,
 * 1 over, which are both measurements, and 2 or a crash, which are not), the command that was run (recorded
 * verbatim), the global measurement (an empty project in a neutral directory, removed afterwards), and the
 * project's own share (files inside the project, a sibling that shares its name prefix, a file on another
 * drive).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `budget.mjs`. Cada caso corre un sustituto CONSTRUIDO de
 * `capture.mjs budget`, nunca el real. Espacio de estados: el parser del informe, los códigos de salida
 * (0 y 1 son mediciones; 2 o un fallo no), el comando ejecutado, la medición global (un proyecto vacío en un
 * directorio neutro, borrado después) y la parte propia del proyecto.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { measureBudget, measureBudgets, parseBudget } from './budget.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns; a throw is a failed check, never a crash of the selftest. @es Lo que devuelve `action`; un fallo es un check fallido, no una caída. */
function attempt(action) {
  try {
    return action();
  } catch (error) {
    failures.push(`threw — ${error.message}`);

    return {};
  }
}

const scratch = mkdtempSync(path.join(tmpdir(), 'budget-selftest-'));
const PROJECT = path.join(scratch, 'projects', 'b100');

/** A report in the shape `capture.mjs budget` prints. @es Un informe con la forma que imprime `capture.mjs budget`. */
const report = ({ raw = '244,965', counted = '244,059', ceiling = '147,000', rows = [] }) => [
  `budget OVER: ${raw} raw characters (harness-counted ${counted}) against ${ceiling} (global ceiling), margin -97,965. @es presupuesto EXCEDIDO: ${raw} caracteres brutos.`,
  'files by weight, raw / counted. @es ficheros por peso, bruto / contado.',
  ...rows.map(([rawSize, countedSize, file]) => `  ${rawSize} / ${countedSize}  ${file}`),
  'over the harness per-file limit of 40,000 (reported, not decided on). @es sobre el límite por fichero.',
  `  77,449  ${PROJECT}\\.claude\\AGENT-LEDGER.md`,
  'missing imports (informational). @es imports ausentes.',
  `  ${PROJECT}\\.claude\\es (imported by x)`
].join('\n');

const ROWS = [
  ['77,449', '70,000', `${PROJECT}\\.claude\\AGENT-LEDGER.md`],
  ['42,124', '42,124', 'C:\\Users\\u\\.claude\\rules\\promoted-rules.md'],
  ['3,000', '3,000', `${PROJECT}-sibling\\.claude\\CLAUDE.md`],
  ['9,999', '9,999', 'D:\\elsewhere\\CLAUDE.md'],
  ['35,204', '34,298', 'C:\\Users\\u\\.claude\\CLAUDE.md']
];

/** A stand-in for `capture.mjs budget` printing `stdout` and exiting `code`, logging its calls. @es Un sustituto de `capture.mjs budget` que imprime `stdout`, sale con `code` y registra sus llamadas. */
function standIn(name, stdout, code) {
  const file = path.join(scratch, `${name}.mjs`);
  const log = path.join(scratch, `${name}.log`);

  writeFileSync(file, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + '\\n');\nprocess.stdout.write(${JSON.stringify(stdout)});\nprocess.exit(${code});\n`);

  return { file, calls: () => readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) };
}

// --- the parser ---
{
  const parsed = attempt(() => parseBudget(report({ rows: ROWS }))) ?? {};

  check('parser: the three figures lose their thousands separators', [parsed.rawChars, parsed.harnessChars, parsed.ceiling], [244965, 244059, 147000]);
  check('parser: every file row is read with raw and counted sizes, in report order', parsed.files?.map((row) => [row.raw, row.counted]), [[77449, 70000], [42124, 42124], [3000, 3000], [9999, 9999], [35204, 34298]]);
  check('parser: the file name is the rest of the row', parsed.files?.[1]?.file, 'C:\\Users\\u\\.claude\\rules\\promoted-rules.md');
  check('parser: the per-file-limit and missing-import sections are not file rows', parsed.files?.length, 5);
  check('parser: a report with Windows line endings parses the same', attempt(() => parseBudget(report({ rows: ROWS }).split('\n').join('\r\n')))?.files?.map((row) => row.file), parsed.files?.map((row) => row.file));
  check('parser: a report without figures is not a measurement', attempt(() => parseBudget('nothing useful here')), undefined);
  check('parser: small figures without separators', attempt(() => parseBudget('budget OK: 950 raw characters (harness-counted 900) against 147,000 (x)'))?.rawChars, 950);
  check('parser: the harness-counted and ceiling figures each lose their separators', attempt(() => parseBudget('budget OK: 950 raw characters (harness-counted 1,900) against 1,147,000 (x)'))?.ceiling, 1147000);
  check('parser: the harness-counted figure', attempt(() => parseBudget('budget OK: 950 raw characters (harness-counted 1,900) against 147,000 (x)'))?.harnessChars, 1900);
}

// --- one measurement ---
{
  const over = standIn('over', report({ rows: ROWS }), 1);
  const measured = attempt(() => measureBudget({ capture: over.file, project: PROJECT, cwd: scratch }));

  check('measure: exit 1 (over the ceiling) is still a measurement', [measured.measured, measured.exitCode, measured.rawChars], [true, 1, 244965]);
  check('measure: the command is recorded verbatim', measured.command, `node ${over.file} budget --project ${PROJECT}`);
  check('measure: it runs in the directory it was given', over.calls()[0].cwd, scratch);
  check('measure: the project goes after the --project flag', over.calls()[0].args, ['budget', '--project', PROJECT]);

  const within = attempt(() => measureBudget({ capture: standIn('within', report({ rows: ROWS }), 0).file, project: PROJECT, cwd: scratch }));

  check('measure: exit 0 (within the ceiling) is a measurement', [within.measured, within.exitCode], [true, 0]);

  const broken = attempt(() => measureBudget({ capture: standIn('broken', report({ rows: ROWS }), 2).file, project: PROJECT, cwd: scratch }));

  check('measure: exit 2 (broken configuration) is NOT a measurement, whatever was printed', [broken.measured, broken.exitCode], [false, 2]);

  const silent = attempt(() => measureBudget({ capture: standIn('silent', 'garbage', 0).file, project: PROJECT, cwd: scratch }));

  check('measure: exit 0 with an unreadable report is NOT a measurement', [silent.measured, silent.exitCode], [false, 0]);

  const missing = attempt(() => measureBudget({ capture: path.join(scratch, 'absent.mjs'), project: PROJECT, cwd: scratch }));

  check('measure: a capture script that cannot run is NOT a measurement', [missing.measured, missing.exitCode !== 0], [false, true]);
  check('measure: the project share counts only files inside the project (not a prefix sibling, not another drive)', measured.projectRawChars, 77449);
  check('measure: the sibling row is still reported among the files', measured.files?.some((row) => row.file.includes('-sibling')), true);
}

// --- the two measurements together ---
{
  // The temp root is given as a JUNCTION: a file reached through two spellings of one directory (a Windows
  // 8.3 short name and the long one) is counted twice by the budget command, so the empty project must sit
  // under the REAL path of the temp root.
  // @es La raíz temporal se da como JUNCTION: un fichero alcanzado por dos grafías de un mismo directorio
  // (nombre corto 8.3 y largo en Windows) lo cuenta dos veces el comando, así que el proyecto vacío debe
  // estar bajo la ruta REAL de la raíz temporal.
  const realRoot = path.join(scratch, 'neutral-real');

  mkdirSync(realRoot, { recursive: true });
  symlinkSync(realRoot, path.join(scratch, 'neutral-link'), 'junction');

  const stand = standIn('both', report({ rows: ROWS }), 1);
  const both = attempt(() => measureBudgets({ capture: stand.file, project: PROJECT, tmp: path.join(scratch, 'neutral-link') }));
  const [globalCall, projectCall] = stand.calls();

  check('both: the global run asks for an empty project directly under the REAL path of the temp root', [globalCall.args[1], path.dirname(globalCall.args[2] ?? '')], ['--project', realpathSync.native(realRoot)]);
  check('both: the project run asks for the real project, after the global one', [projectCall?.args[2], stand.calls().length], [PROJECT, 2]);
  check('both: the global run runs from that same empty directory', globalCall.cwd, globalCall.args[2]);
  check('both: the project run also runs from it, never from the caller directory', projectCall?.cwd, globalCall.args[2]);
  check('both: the empty directory is removed afterwards', existsSync(globalCall.args[2]), false);
  check('both: the project measurement names the real project', both.project?.command?.endsWith(`--project ${PROJECT}`), true);
  check('both: the two measurements are kept apart', [both.global?.measured, both.project?.measured, both.global?.projectRawChars], [true, true, 0]);
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
