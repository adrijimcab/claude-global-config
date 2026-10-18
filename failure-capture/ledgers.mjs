/**
 * Where each lesson lives, by scope: `[global]` lessons in the home ledger (loaded in EVERY project by
 * `~/.claude/rules/20-lessons.md`), and a project's own lessons in `<project>/.claude/lessons-ledger.md`
 * (loaded only there, by an `@lessons-ledger.md` import in that project's `.claude/CLAUDE.md`). It used to
 * be one global file, and 50 b100 lessons travelled to every other project; it was also injected per
 * prompt through a 54 KB `cat` that the harness cut to a 2 KB preview (measured 2026-09-28: 0 of 82
 * lessons reached the model).
 *
 * Since 2026-09-30 the loop is global, so the project is no longer a constant: it comes from
 * `project.mjs`, for the directory a command runs in. A key is UNIQUE across the ledgers it can see: a
 * recurrence folds in where the key already is, whatever scope the new capture declares, so a lesson is
 * never split over two lines.
 *
 * @es Dónde vive cada lección según su alcance: las `[global]` en el ledger del home y las de un proyecto
 * en `<proyecto>/.claude/lessons-ledger.md`, cargado solo allí por un `@lessons-ledger.md` en su
 * `.claude/CLAUDE.md`. Desde el 2026-09-30 el bucle es global y el proyecto sale de `project.mjs`. Una
 * clave es ÚNICA entre los ledgers visibles: una recurrencia se suma donde ya está.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { PROMOTED_SCOPE, STUBS_HEADER, areaLedgerFile, areaLedgerHeader, areaScopes, stubsLedgerFile } from './ledger-routes.mjs';
import { GLOBAL_SCOPE, projectAreaFile } from './project.mjs';

/** The header of a new ledger; it says what loads it, so nobody injects it per prompt again. @es El encabezado de un ledger nuevo. */
export const HEADER = (scope, loader) =>
  `# Lessons Ledger — ${scope}\n\nOne line per RULE (a repeat folds into its line and bumps the counter). Loaded at session start by\n${loader} — never injected per prompt. Machine state: the trailing \`<!--fc:KEY#N-->\` marker belongs to\n\`~/.claude/failure-capture/\`; this file is written only by \`capture.mjs\`, never by hand.\n\n---\n`;

/** What loads each kind of ledger, as its header says. @es Qué carga cada tipo de ledger. */
export const GLOBAL_LOADER = '`~/.claude/rules/20-lessons.md`';
export const PROJECT_LOADER = '`.claude/CLAUDE.md` (an `@lessons-ledger.md` import)';

/** The home ledger's file. @es El fichero del ledger del home. */
export const globalLedgerFile = (home = homedir()) => path.join(home, '.claude', 'lessons-ledger.md');

/**
 * The ledgers every command of this home can see, whatever the project: the loaded home ledger, the path-scoped
 * ledger of each area and the unloaded file of the promoted stubs (`ledger-routes.mjs`).
 * @es Los ledgers que ve todo comando de este home, sea cual sea el proyecto: el ledger del home, cargado, el de cada área con alcance de ruta y el fichero NO cargado de los muñones promovidos.
 */
export const homeLedgerFiles = (home = homedir()) => ({
  [GLOBAL_SCOPE]: { file: globalLedgerFile(home), header: HEADER(GLOBAL_SCOPE, GLOBAL_LOADER) },
  ...Object.fromEntries(areaScopes().map((area) => [area, { file: areaLedgerFile(home, area), header: areaLedgerHeader(area) }])),
  [PROMOTED_SCOPE]: { file: stubsLedgerFile(home), header: STUBS_HEADER },
});

/**
 * The ledger files a command can see: the home's, and its project's when it runs in one.
 * @param options `{ project, home }` — `project` from `project.mjs`, or `undefined`.
 * @es Los ledgers que ve un comando: los del home y, si corre en un proyecto, el suyo.
 */
export function ledgerFiles({ project, home = homedir() }) {
  const files = homeLedgerFiles(home);

  if (project !== undefined) {
    files[project.scope] = { file: project.ledgerFile, header: HEADER(project.scope, PROJECT_LOADER) };
    Object.assign(files, projectAreaLedgerFiles(project));
  }

  return files;
}

/**
 * The path-scoped ledger of each area a project declares (`project-areas.mjs`), keyed by area name.
 * @param project `{ root, areas }` from `project.mjs`.
 * @es El ledger con alcance de ruta de cada área que declara un proyecto, por nombre de área.
 */
export const projectAreaLedgerFiles = ({ root, areas = {} }) =>
  Object.fromEntries(Object.entries(areas).map(([area, definition]) => [area, { file: projectAreaFile(root, area), header: areaLedgerHeader(area, definition) }]));

/** The lines of each ledger that exists, in a stable order (global first). @es Las líneas de cada ledger existente. */
export function readLedgers(files) {
  return Object.entries(files).map(([scope, { file, header }]) => ({
    scope,
    file,
    header,
    lines: existsSync(file) ? readFileSync(file, 'utf8').split('\n') : undefined
  }));
}

/** The ledger (of `ledgers`) whose line carries `key`'s marker, with the line index. @es El ledger cuya línea lleva la clave. */
export function locateKey(ledgers, key, readMarker) {
  for (const ledger of ledgers) {
    const index = (ledger.lines ?? []).findIndex((line) => readMarker(line)?.key === key);

    if (index !== -1) return { ledger, index };
  }

  return undefined;
}

/** The ledger a NEW lesson of `scope` goes into, creating its lines with a header when absent. @es El ledger de una lección NUEVA. */
export function ledgerForScope(ledgers, scope) {
  const ledger = ledgers.find((candidate) => candidate.scope === scope);

  if (ledger === undefined) throw new Error(`no ledger for scope "${scope}"`);

  ledger.lines ??= ledger.header.split('\n');

  return ledger;
}

/**
 * Writes a ledger, collapsing trailing blank lines to one. The text goes to a temporary file beside the
 * ledger and is renamed over it, so a crash or a failed write leaves the previous ledger whole, never a
 * truncated one, and a caller that removes something once this returns can rely on it being on disk.
 * @es Escribe un ledger, colapsando las líneas en blanco finales a una. El texto va a un fichero temporal
 * junto al ledger y se renombra encima: una caída o una escritura fallida deja el ledger anterior entero,
 * nunca uno truncado, y quien borre algo al volver esta función puede contar con que ya está en disco.
 */
export function writeLedger(ledger) {
  const lines = [...ledger.lines];

  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') lines.pop();

  const temp = `${ledger.file}.${String(process.pid)}.tmp`;

  // A project's area ledger sits in `.claude/rules/`, which the project may not have yet.
  // @es El ledger de un área de proyecto está en `.claude/rules/`, que el proyecto puede no tener aún.
  mkdirSync(path.dirname(ledger.file), { recursive: true });

  try {
    writeFileSync(temp, lines.join('\n'), 'utf8');
    renameSync(temp, ledger.file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
