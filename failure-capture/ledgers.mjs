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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { GLOBAL_SCOPE } from './project.mjs';

/** The header of a new ledger; it says what loads it, so nobody injects it per prompt again. @es El encabezado de un ledger nuevo. */
export const HEADER = (scope, loader) =>
  `# Lessons Ledger — ${scope}\n\nOne line per RULE (a repeat folds into its line and bumps the counter). Loaded at session start by\n${loader} — never injected per prompt. Machine state: the trailing \`<!--fc:KEY#N-->\` marker belongs to\n\`~/.claude/failure-capture/\`; this file is written only by \`capture.mjs\`, never by hand.\n\n---\n`;

/** What loads each kind of ledger, as its header says. @es Qué carga cada tipo de ledger. */
export const GLOBAL_LOADER = '`~/.claude/rules/20-lessons.md`';
export const PROJECT_LOADER = '`.claude/CLAUDE.md` (an `@lessons-ledger.md` import)';

/** The home ledger's file. @es El fichero del ledger del home. */
export const globalLedgerFile = (home = homedir()) => path.join(home, '.claude', 'lessons-ledger.md');

/**
 * The ledger files a command can see: the global one, and its project's when it runs in one.
 * @param options `{ project, home }` — `project` from `project.mjs`, or `undefined`.
 * @es Los ledgers que ve un comando: el global y, si corre en un proyecto, el suyo.
 */
export function ledgerFiles({ project, home = homedir() }) {
  const files = { [GLOBAL_SCOPE]: { file: globalLedgerFile(home), header: HEADER(GLOBAL_SCOPE, GLOBAL_LOADER) } };

  if (project !== undefined) files[project.scope] = { file: project.ledgerFile, header: HEADER(project.scope, PROJECT_LOADER) };

  return files;
}

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

/** Writes a ledger, collapsing trailing blank lines to one. @es Escribe un ledger. */
export function writeLedger(ledger) {
  const lines = [...ledger.lines];

  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') lines.pop();

  writeFileSync(ledger.file, lines.join('\n'), 'utf8');
}
