#!/usr/bin/env node
/**
 * A clean break for state polluted by test data: moves the append-only journals and registries of every
 * mechanism of a Claude home into a dated archive, `<home>/state-archive/<date>/<mechanism>/<file>`, and leaves
 * in place everything a guard needs to decide correctly on the next turn (locks, per-session markers, dismissals
 * and pending entries still in force).
 *
 * Usage: node rotate.mjs [--home <dir>] [--date YYYY-MM-DD] [--dry-run | --apply]
 *   --home     the Claude home (default: `claudeHome()`, i.e. `HOOK_CLAUDE_HOME` or `~/.claude`).
 *   --dry-run  the DEFAULT: prints the plan, changes nothing.
 *   --apply    executes the plan. REFUSED (exit 2, nothing changed) while a live Claude Code session is
 *              registered in `<home>/sessions/` (its `pid` is alive) or while a state lock exists.
 *
 * EVERY FILE IS CLASSIFIED EXPLICITLY by `KINDS`, mechanism and path, first match wins:
 *   ARCHIVE  append-only history (refusals, errors, observations, logs, the fires counter): moved.
 *   JOURNAL  the v2 hook journal (`journal.jsonl`): moved, and its `dismissal` records, the only ones that
 *            lift a block (`dismiss.mjs` `isLifted`), are written back into a fresh journal.
 *   KEEP     operative state a guard reads to decide: left in place.
 *   LOCK     a writer's lock: left in place, and its presence refuses `--apply`.
 * A file no rule names is UNKNOWN: reported and left alone, never guessed.
 *
 * IDEMPOTENT. A moved file is gone, a journal that holds only the dismissals in force is current, and an empty
 * file has nothing to archive, so a second run plans nothing. An archive file that already exists (a second
 * rotation the same day) is appended to, never overwritten.
 *
 * Exit 0 plan printed or applied; 1 a move failed (the files reported before it were rotated, the rest are
 * untouched); 2 refused or bad arguments. Every line is a bilingual message of `rotate-messages.mjs`.
 *
 * @es Un corte limpio para estado contaminado con datos de prueba: mueve los journals y registros de solo-añadir
 * de cada mecanismo de un home de Claude a un archivo fechado, `<home>/state-archive/<fecha>/<mecanismo>/<fichero>`,
 * y deja en su sitio lo que una guardia necesita para decidir bien en el siguiente turno (locks, marcas por
 * sesión, descartes y pendientes vigentes). Por defecto `--dry-run` imprime el plan; `--apply` lo ejecuta y se
 * RECHAZA (salida 2, sin cambios) mientras haya una sesión viva de Claude Code registrada en `<home>/sessions/`
 * o exista un lock de estado. Cada fichero se clasifica EXPLÍCITAMENTE en `KINDS` (ARCHIVE, JOURNAL con los
 * descartes vigentes devueltos a un journal nuevo, KEEP, LOCK); uno que ninguna regla nombra es DESCONOCIDO: se
 * informa y se deja, nunca se adivina. IDEMPOTENTE: una segunda corrida no planifica nada; un fichero de archivo
 * que ya existe se amplía, nunca se sobrescribe. Salida 0 plan o aplicado; 1 falló un movimiento; 2 rechazado.
 */

import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { claudeHome, stateDirsUnder } from './locations.mjs';
import { speakerFor } from './rotate-messages.mjs';

/** The kinds of state. @es Los tipos de estado. */
export const ARCHIVE = 'archive';
export const JOURNAL = 'journal';
export const KEEP = 'keep';
export const LOCK = 'lock';
export const UNKNOWN = 'unknown';

/** Any mechanism. @es Cualquier mecanismo. */
const ANY = '*';

/** The folder of a home that holds the archives. @es La carpeta del home que guarda los archivos. */
export const ARCHIVE_FOLDER = 'state-archive';

/** The folder where Claude Code registers each live session. @es La carpeta donde Claude Code registra cada sesión viva. */
const SESSIONS_FOLDER = 'sessions';

/**
 * Every known state kind: `[mechanism, pattern, kind, reason]`, first match wins. A pattern is a path relative to
 * the mechanism's state directory, `/`-separated; a segment `*` is any one segment, `*.ext` any one segment with
 * that ending, and a last segment `**` any one or more.
 * @es Cada tipo de estado conocido: `[mecanismo, patrón, tipo, motivo]`; gana la primera coincidencia.
 */
export const KINDS = Object.freeze([
  ['agent-liveness', 'lifecycle.jsonl', ARCHIVE, 'subagent start and stop events; a rotation refuses while a session lives, so no agent is running'],
  ['backlog-content-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['backlog-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['backlog-guard', 'dismissals.jsonl', KEEP, 'dismissals in force'],
  ['backlog-guard', '*.json', KEEP, "a session's transcript offset"],
  ['backlog-owner-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['brief-audience', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['brief-feasibility', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['brief-provenance', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['brief-tenancy', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['collision-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['collision-guard', 'guard-errors.jsonl', ARCHIVE, 'malfunction journal'],
  ['config-sync-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['config-sync-guard', 'dismissals.jsonl', KEEP, 'dismissals in force'],
  ['config-sync-guard', 'pending.jsonl', KEEP, 'paths still waiting for a commit'],
  ['cwd-change-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['delegation-receipts', 'observed.jsonl', ARCHIVE, 'observation journal'],
  ['delegation-receipts', 'abandoned.jsonl', KEEP, "abandonments a resumed session's guard reads"],
  ['delegation-receipts', 'guard-state.json', KEEP, "each session's cooldown"],
  ['engram-persistence', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['engram-persistence', '*.json', KEEP, "a session's save marker"],
  ['engram-title-integrity', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['eval-guard', 'denials.jsonl', ARCHIVE, 'denial journal'],
  ['eval-guard', 'guard-errors.jsonl', ARCHIVE, 'malfunction journal'],
  ['failure-capture', 'guard-errors.jsonl', ARCHIVE, 'malfunction journal'],
  ['failure-capture', 'condense/**', ARCHIVE, 'pre-images of past condense runs'],
  ['failure-capture', 'ledger.lock', LOCK, 'the ledger writers'],
  ['failure-capture', 'incidents.jsonl', KEEP, 'the recurrence evidence promotion counts'],
  ['failure-capture', 'dismissals.jsonl', KEEP, 'dismissals in force'],
  ['failure-capture', 'last-capture.json', KEEP, 'the stamp the turn guard reads'],
  ['failure-capture', 'guard-state.json', KEEP, "each scope's cooldown"],
  ['failure-capture', 'promoted.md', KEEP, 'promotions of the old tool, still read'],
  ['failure-capture', 'spool/*', KEEP, 'captures not yet folded into a ledger'],
  ['fleet-kit', 'handback/refusals.jsonl', KEEP, 'the refusal count that bounds the handback loop'],
  ['fleet-kit', '*/refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['fleet-kit', '*/notices.jsonl', ARCHIVE, 'notice journal'],
  ['fleet-kit', '*/malfunctions.jsonl', ARCHIVE, 'malfunction journal'],
  ['fleet-kit', 'repos/*/run.lock', LOCK, 'a running gate'],
  ['fleet-kit', 'repos/*/verdicts/*', KEEP, 'the gate verdicts a landing reads'],
  ['fleet-kit', 'repos/*/diff-coverage/**', ARCHIVE, 'output of past coverage runs'],
  ['foreign-delete-guard', 'authored/*.jsonl', ARCHIVE, 'per-agent journal of the paths a delegated agent created; a rotation refuses while a session lives, so no agent is running'],
  ['hook-dispatch', 'errors.jsonl', ARCHIVE, 'dispatcher malfunction journal'],
  ['integrated-worktree-guard', 'observed.jsonl', ARCHIVE, 'observation journal'],
  ['integrated-worktree-guard', 'noticed.json', KEEP, 'the worktree sets each session was shown'],
  ['odd-mirror-guard', 'observed.jsonl', ARCHIVE, 'observation journal'],
  ['odd-mirror-guard', 'noticed.json', KEEP, 'the document sets each session was shown'],
  ['owner-language-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['owner-language-guard', 'guard.log', ARCHIVE, 'guard log'],
  ['review-cwd-guard', 'journal.jsonl', ARCHIVE, 'refusal and fail-open journal'],
  ['review-site', 'journal.jsonl', ARCHIVE, 'review stop-hook decision journal'],
  ['stash-watch', 'observed.jsonl', ARCHIVE, 'observation journal'],
  ['stop-input-recorder', 'stops.jsonl', ARCHIVE, 'what each Stop hook received'],
  ['stash-watch', 'noticed.json', KEEP, 'the stash sets each session was shown'],
  ['type-assertion-guard', 'guard-errors.jsonl', ARCHIVE, 'malfunction journal'],
  ['useless-escape-guard', 'guard-errors.jsonl', ARCHIVE, 'malfunction journal'],
  ['worker-delegation-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal'],
  ['worktree-landing', 'red-logs/*', ARCHIVE, 'whole output of past red verifications, one file per refused landing'],
  [ANY, 'journal.jsonl', JOURNAL, 'hook journal'],
  [ANY, 'fires.json', ARCHIVE, 'fires counter, reset with the journal whose rate it gives']
]);

/** Whether one path segment matches one pattern segment. @es Si un segmento de ruta casa con uno de patrón. */
function segmentMatches(pattern, segment) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) return segment.endsWith(pattern.slice(1)) && segment.length > pattern.length - 1;

  return pattern === segment;
}

/** Whether `relative` (`/`-separated) matches `pattern`. @es Si `relative` casa con `pattern`. */
export function pathMatches(pattern, relative) {
  const wanted = pattern.split('/');
  const given = relative.split('/');

  if (wanted.at(-1) === '**') return given.length >= wanted.length && wanted.slice(0, -1).every((segment, index) => segmentMatches(segment, given[index]));

  return wanted.length === given.length && wanted.every((segment, index) => segmentMatches(segment, given[index]));
}

/**
 * The kind of the file `relative` of `mechanism`: `{ kind, reason }`, `UNKNOWN` when no rule names it.
 * @es El tipo del fichero `relative` de `mechanism`; `UNKNOWN` si ninguna regla lo nombra.
 */
export function classify(mechanism, relative) {
  const rule = KINDS.find(([owner, pattern]) => (owner === mechanism || owner === ANY) && pathMatches(pattern, relative));

  return rule === undefined ? { kind: UNKNOWN, reason: '' } : { kind: rule[2], reason: rule[3] };
}

/** Every file under `directory`, relative and `/`-separated, sorted; a link is listed (as UNKNOWN), never followed. @es Cada fichero bajo `directory`; un enlace se lista, nunca se sigue. */
function filesUnder(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? filesUnder(path.join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]))
    .sort();
}

/** The parsed JSON of a line, `undefined` when it is not JSON. @es El JSON de una línea, `undefined` si no lo es. */
const recordOf = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

/** The lines of a journal that lift a block, kept in force by a rotation. @es Las líneas de un journal que levantan un bloqueo. */
export const dismissalsIn = (text) => text.split('\n').filter((line) => recordOf(line)?.kind === 'dismissal');

/**
 * The plan for the Claude home `home`: one entry per file of every state directory,
 * `{ mechanism, file, source, kind, reason, action, carried? }`, with `action` one of `archive`, `journal`,
 * `keep`, `empty`, `current`, `lock`, `unknown`; sorted by mechanism, then file.
 * @es El plan para el home `home`: una entrada por fichero de cada directorio de estado.
 */
export function planRotation(home) {
  return stateDirsUnder(home).flatMap(({ mechanism, directory }) =>
    filesUnder(directory).map((file) => {
      const source = path.join(directory, ...file.split('/'));
      const { kind, reason } = classify(mechanism, file);
      const entry = { mechanism, file, source, kind, reason };
      const stats = lstatSync(source);
      const empty = stats.size === 0;

      if (stats.isSymbolicLink()) return { ...entry, kind: UNKNOWN, action: 'unknown' };

      if (kind === ARCHIVE) return { ...entry, action: empty ? 'empty' : 'archive' };
      if (kind === LOCK) return { ...entry, action: 'lock' };
      if (kind !== JOURNAL) return { ...entry, action: kind };
      if (empty) return { ...entry, action: 'empty' };

      const lines = readFileSync(source, 'utf8').split('\n').filter((line) => line !== '');
      const carried = dismissalsIn(lines.join('\n'));

      return { ...entry, carried, action: carried.length === lines.length ? 'current' : 'journal' };
    })
  );
}

/**
 * Whether a process with `pid` exists: signal 0 reaches it, or it exists and belongs to another user (`EPERM`).
 * `kill` replaces `process.kill`, a seam for the `EPERM` answer no test process can provoke as itself.
 * @es Si existe un proceso con `pid`: la señal 0 llega, o existe y es de otro usuario (`EPERM`).
 */
export function processAlive(pid, kill = process.kill) {
  try {
    kill(pid, 0);

    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * The live Claude Code sessions registered in `<home>/sessions/`: `{ file, pid }` for each `<name>.json` whose
 * numeric `pid` is alive. An unreadable record is no live session.
 * @es Las sesiones vivas de Claude Code registradas en `<home>/sessions/`.
 */
export function liveSessions(home, alive = processAlive) {
  const directory = path.join(home, SESSIONS_FOLDER);

  if (!existsSync(directory)) return [];

  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      const file = path.join(directory, name);
      const pid = recordOf(readFileSync(file, 'utf8'))?.pid;

      return Number.isSafeInteger(pid) && pid > 0 && alive(pid) ? [{ file, pid }] : [];
    });
}

/** Why `--apply` must not run now, as `[message id, params]`; empty when it may. @es Por qué no puede correr `--apply` ahora. */
function blockersOf(home, plan, alive) {
  return [
    ...liveSessions(home, alive).map(({ file, pid }) => ['live-session', { file, pid }]),
    ...plan.filter((entry) => entry.action === 'lock').map((entry) => ['held-lock', { file: entry.source }])
  ];
}

/** Appends `source` to `target`, or moves it there when `target` does not exist. @es Añade `source` a `target`, o lo mueve si no existe. */
function moveInto(source, target) {
  mkdirSync(path.dirname(target), { recursive: true });

  if (existsSync(target)) {
    appendFileSync(target, readFileSync(source));
    rmSync(source);

    return;
  }

  try {
    renameSync(source, target);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;

    copyFileSync(source, target);
    rmSync(source);
  }
}

/** Executes the plan's moves into `archive`; returns how many files were rotated. @es Ejecuta los movimientos del plan. */
function applyPlan(plan, archive, speaker) {
  let count = 0;

  for (const entry of plan.filter(({ action }) => action === 'archive' || action === 'journal')) {
    const target = path.join(archive, entry.mechanism, ...entry.file.split('/'));

    try {
      moveInto(entry.source, target);
      speaker.say('archived', { file: entry.source, target });

      if (entry.action === 'journal' && entry.carried.length > 0) {
        writeFileSync(`${entry.source}.tmp`, `${entry.carried.join('\n')}\n`);
        renameSync(`${entry.source}.tmp`, entry.source);
        speaker.say('carried', { carried: entry.carried.length, file: entry.source });
      }

      count += 1;
    } catch (error) {
      speaker.complain('failed', { file: entry.source, detail: error instanceof Error ? error.message : String(error) });

      return { count, failed: true };
    }
  }

  return { count, failed: false };
}

/** The plan line of one entry. @es La línea de plan de una entrada. */
function sayEntry(speaker, entry) {
  const file = `${entry.mechanism}/${entry.file}`;
  const lines = {
    archive: () => speaker.say('plan-archive', { file, reason: entry.reason }),
    journal: () => speaker.say('plan-journal', { file, carried: entry.carried.length }),
    current: () => speaker.say('plan-journal-current', { file, carried: entry.carried.length }),
    empty: () => speaker.say('plan-empty', { file }),
    keep: () => speaker.say('plan-keep', { file, reason: entry.reason }),
    lock: () => speaker.say('plan-lock', { file, reason: entry.reason }),
    unknown: () => speaker.say('plan-unknown', { file })
  };

  lines[entry.action]();
}

/** Reads the command line, or returns `{ problem }`. @es Lee la línea de órdenes, o devuelve `{ problem }`. */
function parseArgs(argv, now) {
  const options = { home: claudeHome(), date: new Date(now).toISOString().slice(0, 10), apply: false };
  const modes = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--apply' || argument === '--dry-run') {
      modes.add(argument);
      options.apply = argument === '--apply';
    } else if (argument === '--home' || argument === '--date') {
      const value = argv[index + 1];

      if (value === undefined || value.startsWith('--')) return { problem: `${argument} needs a value` };

      options[argument.slice(2)] = argument === '--home' ? path.resolve(value) : value;
      index += 1;
    } else {
      return { problem: argument };
    }
  }

  if (modes.size > 1) return { problem: '--dry-run and --apply together' };

  return options;
}

/**
 * Runs the command on `argv` and returns its exit code. `alive` replaces the process probe, `now` the clock.
 * @es Corre el comando sobre `argv` y devuelve su código de salida.
 */
export function main(argv, { sink = console, now = Date.now(), alive = processAlive } = {}) {
  const speaker = speakerFor(sink);
  const refuse = (id, params) => {
    speaker.complain(id, params);

    return 2;
  };
  const options = parseArgs(argv, now);

  if (options.problem !== undefined) return refuse('usage', { problem: options.problem });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) return refuse('bad-date', { date: options.date });
  if (statSync(options.home, { throwIfNoEntry: false })?.isDirectory() !== true) return refuse('no-home', { home: options.home });

  const archive = path.join(options.home, ARCHIVE_FOLDER, options.date);
  const plan = planRotation(options.home);
  const blockers = blockersOf(options.home, plan, alive);

  if (options.apply && blockers.length > 0) {
    speaker.complain('refused');
    for (const [id, params] of blockers) speaker.complain(id, params);

    return 2;
  }

  speaker.say('header', { home: options.home, archive, mode: options.apply ? '--apply' : '--dry-run' });
  for (const entry of plan) sayEntry(speaker, entry);

  const moving = plan.filter(({ action }) => action === 'archive' || action === 'journal').length;

  speaker.say('summary', { archive: moving, keep: plan.filter(({ action }) => !['archive', 'journal', 'unknown'].includes(action)).length, unknown: plan.filter(({ action }) => action === 'unknown').length });

  if (moving === 0) {
    speaker.say('nothing-to-do');

    return 0;
  }

  if (!options.apply) {
    if (blockers.length > 0) speaker.say('would-refuse');
    for (const [id, params] of blockers) speaker.say(id, params);
    speaker.say('dry-run');

    return 0;
  }

  const { count, failed } = applyPlan(plan, archive, speaker);

  if (failed) return 1;

  speaker.say('done', { count, archive });

  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
