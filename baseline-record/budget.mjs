/**
 * The raw size of the always-loaded sets, read from the owner's own measurement command
 * (`capture.mjs budget --project <dir>`): the command and its exit code are recorded with every figure.
 * Exit 0 (within the ceiling) and exit 1 (over it) are both MEASUREMENTS; exit 2 or a report with no figures
 * is not, whatever was printed.
 *
 * The global set is measured with an EMPTY project in a neutral directory, so no project file is added to it
 * and the directory the caller stands in cannot contribute a `CLAUDE.md` of its own (a worktree of `~/.claude`
 * would count its copy of the global one twice).
 *
 * @es El tamaño bruto de los conjuntos siempre cargados, leído del comando de medición del dueño
 * (`capture.mjs budget --project <dir>`): cada cifra lleva el comando y su código de salida. Salida 0 (dentro
 * del techo) y 1 (sobre él) son MEDICIONES; 2 o un informe sin cifras no, se imprima lo que se imprima. El
 * conjunto global se mide con un proyecto VACÍO en un directorio neutro, para que ningún fichero de proyecto
 * ni el directorio del que se llama se sumen a él.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

const FIGURES = /([\d,]+) raw characters \(harness-counted ([\d,]+)\) against ([\d,]+)/;
const FILE_ROW = /^\s+([\d,]+) \/ ([\d,]+)\s+(\S.*)$/;
const number = (text) => Number(text.split(',').join(''));

/** The figures and file rows of a budget report, or `undefined` when it has no figures. @es Las cifras y filas de un informe, o `undefined` si no tiene cifras. */
export function parseBudget(text) {
  const figures = FIGURES.exec(text);

  if (figures === null) return undefined;

  const files = text.split('\n').map((line) => FILE_ROW.exec(line.trimEnd())).filter((row) => row !== null).map((row) => ({ raw: number(row[1]), counted: number(row[2]), file: row[3] }));

  return { rawChars: number(figures[1]), harnessChars: number(figures[2]), ceiling: number(figures[3]), files };
}

/** Whether `child` lies inside `parent`, by path relation and not by string prefix (a file never IS its directory). @es Si `child` está dentro de `parent`, por relación de rutas y no por prefijo. */
function isInside(parent, child) {
  const relative = path.relative(parent, child);

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** One run of the budget command on `project`, with its verbatim command and exit code. @es Una corrida del comando sobre `project`, con su comando y su código de salida. */
export function measureBudget({ capture, project, cwd }) {
  const run = spawnSync(process.execPath, [capture, 'budget', '--project', project], { cwd, encoding: 'utf8', windowsHide: true });
  const exitCode = run.status;
  const parsed = parseBudget(run.stdout ?? '');
  const measured = (exitCode === 0 || exitCode === 1) && parsed !== undefined;

  return { command: `node ${capture} budget --project ${project}`, exitCode, measured, ...parsed, projectRawChars: (parsed?.files ?? []).filter((row) => isInside(project, row.file)).reduce((sum, row) => sum + row.raw, 0) };
}

/** The global set (an empty project) and the project, each measured on its own. @es El conjunto global (un proyecto vacío) y el proyecto, cada uno medido por separado. */
export function measureBudgets({ capture, project, tmp }) {
  const neutral = mkdtempSync(path.join(tmp, 'budget-neutral-'));

  try {
    return { global: measureBudget({ capture, project: neutral, cwd: neutral }), project: measureBudget({ capture, project, cwd: neutral }) };
  } finally {
    rmSync(neutral, { recursive: true, force: true });
  }
}
