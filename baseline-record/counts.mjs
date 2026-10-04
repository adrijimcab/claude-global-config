/**
 * What a Claude home holds in numbers: the lines of every guard journal, per guard, and the entries of the
 * hook registry (settings events, groups and hooks; manifests and their guards; registration sidecars). The
 * journal population comes from the tree through `journal-backup`, the same walk the backup uses, so the two
 * can never disagree about what a journal is. Sidecars come from git's own file listing (tracked plus
 * untracked-not-ignored), never from a hand list of directories.
 *
 * @es Lo que contiene un home de Claude en números: las líneas de cada journal de guardia, por guardia, y las
 * entradas del registro de hooks (eventos, grupos y hooks de settings; manifiestos y sus guardias; sidecars de
 * registro). Los journals salen del árbol por `journal-backup`, el mismo recorrido de la copia, y los sidecars
 * del listado de git (rastreados y sin rastrear no ignorados), nunca de una lista a mano.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { discoverJournals } from '../journal-backup/backup.mjs';

/** Lines of a file: its newlines, plus one for a last line with no newline. @es Líneas de un fichero: sus saltos, y una más si la última no termina en salto. */
function linesOf(file) {
  const bytes = readFileSync(file);

  return bytes.filter((byte) => byte === 10).length + (bytes.length > 0 && bytes.at(-1) !== 10 ? 1 : 0);
}

/** Per-guard and total journal lines under `home`. @es Líneas de journal por guardia y en total bajo `home`. */
export function journalCounts(home) {
  const files = discoverJournals(home).map((file) => ({ file, guard: file.split('/')[0], lines: linesOf(path.join(home, file)) }));
  const perGuard = {};

  for (const { guard, lines } of files) perGuard[guard] = (perGuard[guard] ?? 0) + lines;

  return { files: files.map(({ file, lines }) => ({ file, lines })), perGuard, totalLines: files.reduce((sum, entry) => sum + entry.lines, 0) };
}

/** The parsed JSON of `file`, or `undefined` when it cannot be read or parsed. @es El JSON de `file`, o `undefined` si no se puede leer. */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Events, groups and hooks of `settings.json`. @es Eventos, grupos y hooks de `settings.json`. */
function settingsCounts(home) {
  const settings = readJson(path.join(home, 'settings.json'));

  if (settings === undefined) return 'unreadable';

  const events = {};

  for (const [event, groups] of Object.entries(settings.hooks ?? {})) events[event] = { groups: groups.length, hooks: groups.reduce((sum, group) => sum + (group.hooks?.length ?? 0), 0) };

  return { events, totalHooks: Object.values(events).reduce((sum, entry) => sum + entry.hooks, 0) };
}

/** Guards of each manifest in `hook-dispatch/manifests`; a manifest that does not parse is named. @es Guardias de cada manifiesto; uno que no parsea se nombra. */
function manifestCounts(home) {
  const dir = path.join(home, 'hook-dispatch', 'manifests');
  const files = {};

  for (const name of (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name)) {
    const guards = readJson(path.join(dir, name))?.guards;

    files[name] = Array.isArray(guards) ? guards.length : 'unreadable';
  }

  return { files, totalGuards: Object.values(files).reduce((sum, count) => sum + (typeof count === 'number' ? count : 0), 0) };
}

/** Registration sidecars git lists under `home`, or `unmeasurable` when git cannot list them. @es Sidecars de registro que git lista bajo `home`, o `unmeasurable`. */
function sidecarCount(home) {
  const run = spawnSync('git', ['-C', home, 'ls-files', '--cached', '--others', '--exclude-standard', '--', '*.hook-registration.json'], { encoding: 'utf8', windowsHide: true });

  return run.status === 0 ? run.stdout.split('\n').filter((line) => line !== '').length : 'unmeasurable';
}

/** The hook registry entry counts of `home`. @es Las entradas del registro de hooks de `home`. */
export function registryCounts(home) {
  return { settings: settingsCounts(home), manifests: manifestCounts(home), sidecars: sidecarCount(home) };
}
