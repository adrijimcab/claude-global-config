#!/usr/bin/env node
/**
 * Copies every guard journal under a Claude home (`failure-capture/state/incidents.jsonl` and every
 * `<guard>/state/*.jsonl`) into `<backup-root>/journals-<date>/`, keeping relative paths, then proves each
 * copy equal to its source by line count and sha256 before saying so.
 *
 * The population is read from the directory tree, never from a list, so a journal a new guard adds is
 * backed up without editing this file. Exit codes: 0 backed up and verified; 1 a copy differs from its
 * source (every offending file is named); 2 refused or misused, nothing measured.
 *
 * It refuses a target inside any `<guard>/state` directory (the trees a cleaner empties would take the
 * backup with them) and a target that already exists with different content (never merged, never
 * overwritten). Only the lexical position of the target is judged, not links it may cross.
 *
 * @es Copia cada journal de guardia bajo un home de Claude (`failure-capture/state/incidents.jsonl` y cada
 * `<guardia>/state/*.jsonl`) a `<raíz-de-copia>/journals-<fecha>/`, conservando rutas relativas, y prueba
 * cada copia igual a su origen por número de líneas y sha256 antes de decirlo. La población sale del árbol
 * de directorios, nunca de una lista. Salidas: 0 copiado y verificado; 1 una copia difiere de su origen;
 * 2 rechazado o mal usado, nada medido. Rechaza un destino dentro de cualquier `<guardia>/state` y un
 * destino que ya existe con contenido distinto. Solo se juzga la posición léxica del destino, no los
 * enlaces que pueda cruzar.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Every runtime message, English first, then the Spanish half. @es Cada mensaje, inglés primero y luego el español. */
export const MESSAGES = {
  copied: { en: 'Copied {file}: {lines} lines, sha256 {sha}.', es: 'Copiado {file}: {lines} líneas, sha256 {sha}.' },
  done: { en: 'Backed up {count} journals to {target}, all verified.', es: 'Copiados {count} journals en {target}, todos verificados.' },
  already: { en: 'Backup {target} already holds identical content, nothing copied.', es: 'La copia {target} ya tiene contenido idéntico, no se copió nada.' },
  mismatchLines: { en: 'MISMATCH LINES {file}: source {source}, backup {backup}.', es: 'DIFERENCIA DE LÍNEAS {file}: origen {source}, copia {backup}.' },
  mismatchSha: { en: 'MISMATCH SHA256 {file}: source {source}, backup {backup}.', es: 'DIFERENCIA DE SHA256 {file}: origen {source}, copia {backup}.' },
  noJournals: { en: 'REFUSED: no journal found under {home}, nothing to back up.', es: 'RECHAZADO: no hay ningún journal bajo {home}, nada que copiar.' },
  insideState: { en: 'REFUSED: {target} lies inside the state tree {state}, which a cleaner empties.', es: 'RECHAZADO: {target} está dentro del árbol de estado {state}, que un limpiador vacía.' },
  differs: { en: 'REFUSED: {target} already exists with different content, it is neither merged nor overwritten.', es: 'RECHAZADO: {target} ya existe con contenido distinto, no se mezcla ni se sobrescribe.' },
  badDate: { en: 'REFUSED: the date {date} is not YYYY-MM-DD.', es: 'RECHAZADO: la fecha {date} no es AAAA-MM-DD.' },
  usage: { en: 'REFUSED: bad arguments ({problem}). Usage: backup.mjs [home] [--backup-root dir] [--date YYYY-MM-DD].', es: 'RECHAZADO: argumentos inválidos ({problem}). Uso: backup.mjs [home] [--backup-root dir] [--date AAAA-MM-DD].' }
};

/** One message in the house form `English @es Español`. @es Un mensaje en la forma `English @es Español`. */
function say(out, id, params = {}) {
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));

  out(`${fill(MESSAGES[id].en)} @es ${fill(MESSAGES[id].es)}`);
}

/** The `<guard>/state` directories of a home, absolute. @es Los directorios `<guardia>/state` de un home. */
function stateTrees(home) {
  return readdirSync(home, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(home, entry.name, 'state')))
    .map((entry) => path.join(home, entry.name, 'state'));
}

/** Every journal of the home, relative with `/`, sorted. @es Cada journal del home, relativo con `/`, ordenado. */
export function discoverJournals(home) {
  return stateTrees(home)
    .flatMap((state) => readdirSync(state, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl')).map((entry) => path.join(state, entry.name)))
    .map((file) => path.relative(home, file).split(path.sep).join('/'))
    .sort();
}

const isInside = (child, parent) => path.relative(parent, child).split(path.sep)[0] !== '..' && !path.isAbsolute(path.relative(parent, child));

/** Line count and sha256 of a file. @es Número de líneas y sha256 de un fichero. */
function digestOf(file) {
  const bytes = readFileSync(file);
  const newlines = [...bytes].filter((byte) => byte === 10).length;

  return { lines: newlines + (bytes.length > 0 && bytes.at(-1) !== 10 ? 1 : 0), sha: createHash('sha256').update(bytes).digest('hex') };
}

/** Every file under a directory, relative with `/`, sorted. @es Cada fichero bajo un directorio, relativo con `/`, ordenado. */
function filesUnder(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/** Whether `target` holds exactly the journals, byte for byte. @es Si `target` tiene exactamente los journals, byte a byte. */
function holdsSame(target, home, journals) {
  return JSON.stringify(filesUnder(target)) === JSON.stringify(journals) && journals.every((relative) => digestOf(path.join(target, relative)).sha === digestOf(path.join(home, relative)).sha);
}

/** Backs the journals of `home` up under `backupRoot`; returns the exit code. @es Copia los journals; devuelve el código de salida. */
export function backupJournals({ home, backupRoot, date, out = console.log, copyFile = copyFileSync }) {
  const journals = discoverJournals(home);
  const target = path.resolve(backupRoot, `journals-${date}`);
  const cleaned = stateTrees(home).find((state) => isInside(target, state));

  if (journals.length === 0) return say(out, 'noJournals', { home }) ?? 2;
  if (cleaned !== undefined) return say(out, 'insideState', { target, state: cleaned }) ?? 2;
  if (existsSync(target)) return holdsSame(target, home, journals) ? say(out, 'already', { target }) ?? 0 : say(out, 'differs', { target }) ?? 2;

  let mismatches = 0;

  for (const relative of journals) {
    mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
    copyFile(path.join(home, relative), path.join(target, relative));
    const source = digestOf(path.join(home, relative));
    const backup = digestOf(path.join(target, relative));

    if (source.lines !== backup.lines) mismatches += say(out, 'mismatchLines', { file: relative, source: source.lines, backup: backup.lines }) ?? 1;
    if (source.sha !== backup.sha) mismatches += say(out, 'mismatchSha', { file: relative, source: source.sha, backup: backup.sha }) ?? 1;
    if (source.sha === backup.sha) say(out, 'copied', { file: relative, lines: source.lines, sha: source.sha });
  }

  if (mismatches > 0) return 1;
  say(out, 'done', { count: journals.length, target });

  return 0;
}

/** Reads the command line, then runs the backup. @es Lee la línea de comandos y corre la copia. */
export function run(argv, { out = console.log } = {}) {
  const options = { home: path.join(homedir(), '.claude'), backupRoot: path.join(homedir(), '.claude-backups'), date: new Date().toISOString().slice(0, 10) };
  const flags = { '--backup-root': 'backupRoot', '--date': 'date' };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = flags[argv[index]];

    if (flag === undefined && argv[index].startsWith('-')) return say(out, 'usage', { problem: argv[index] }) ?? 2;
    if (flag === undefined) options.home = path.resolve(argv[index]);
    else if (argv[index + 1] === undefined) return say(out, 'usage', { problem: `${argv[index]} needs a value` }) ?? 2;
    else options[flag] = argv[(index += 1)];
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) return say(out, 'badDate', { date: options.date }) ?? 2;

  return backupJournals({ ...options, out });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(run(process.argv.slice(2)));
