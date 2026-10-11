/**
 * Owns ONE question: which hook groups does the Claude home register right now. A group is identified by its
 * event, its matcher and its command (the three things Claude Code snapshots at session start). A dispatcher
 * group (`dispatch.mjs <manifest>`) also carries the guards its manifest lists, so a notice can name what the
 * group runs. `undefined` means NOT MEASURABLE (settings absent or unreadable), never "no groups".
 *
 * @es Responde UNA pregunta: qué grupos de hooks registra ahora el home de Claude. Un grupo se identifica por su
 * evento, su matcher y su comando (lo que Claude Code congela al arrancar la sesión). Un grupo del dispatcher
 * (`dispatch.mjs <manifiesto>`) lleva además las guardias que lista su manifiesto. `undefined` significa NO
 * MEDIBLE (settings ausente o ilegible), nunca "sin grupos".
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The settings files that register hooks in the user's Claude home. @es Los settings que registran hooks en el home. */
const SETTINGS_FILES = ['settings.json', 'settings.local.json'];

/** The folder, under the home, where dispatcher manifests live. @es La carpeta de manifiestos del dispatcher. */
const MANIFEST_FOLDER = ['hook-dispatch', 'manifests'];

/** The marker in a dispatcher command that precedes the manifest name. @es La marca previa al nombre del manifiesto. */
const MANIFEST_MARKER = 'manifests/';

const MANIFEST_EXTENSION = '.json';

/** The key that identifies a group across sessions. @es La clave que identifica un grupo entre sesiones. */
export const groupKey = (event, matcher, command) => JSON.stringify([event, matcher ?? '', command]);

/**
 * The manifest name a dispatcher command points at, or `undefined` when the command is not a dispatcher call.
 * @es El nombre de manifiesto al que apunta un comando del dispatcher, o `undefined` si no lo es.
 */
function manifestNameOf(command) {
  const marker = command.indexOf(MANIFEST_MARKER);

  if (marker === -1) return undefined;

  const rest = command.slice(marker + MANIFEST_MARKER.length);
  const end = rest.indexOf(MANIFEST_EXTENSION);

  return end === -1 ? undefined : rest.slice(0, end);
}

/** The guards a manifest lists, or none when it cannot be read. @es Las guardias de un manifiesto, o ninguna si no se lee. */
function manifestGuards(home, name) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(home, ...MANIFEST_FOLDER, `${name}${MANIFEST_EXTENSION}`), 'utf8'));

    return Array.isArray(parsed?.guards) ? parsed.guards.filter((guard) => typeof guard === 'string').map((guard) => guard.split('../').join('')) : [];
  } catch {
    return [];
  }
}

/** The groups one parsed settings object declares. @es Los grupos que declara un settings ya parseado. */
function groupsOf(settings, home) {
  const found = [];

  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    for (const entry of Array.isArray(groups) ? groups : []) {
      for (const hook of Array.isArray(entry?.hooks) ? entry.hooks : []) {
        if (typeof hook?.command !== 'string') continue;

        const manifest = manifestNameOf(hook.command);
        const guards = manifest === undefined ? [] : manifestGuards(home, manifest);

        found.push({ key: groupKey(event, entry.matcher, hook.command), event, matcher: entry.matcher ?? '', command: hook.command, manifest, guards });
      }
    }
  }

  return found;
}

/**
 * Every hook group registered under `home`, keyed by `groupKey`, or `undefined` when the settings cannot be
 * measured. `settings.local.json` may be absent; `settings.json` may not.
 * @es Cada grupo de hooks registrado bajo `home`, por `groupKey`, o `undefined` si no se puede medir. El
 * `settings.local.json` puede faltar; el `settings.json`, no.
 */
export function registeredGroups(home) {
  const groups = new Map();

  try {
    for (const file of SETTINGS_FILES) {
      const full = path.join(home, file);

      if (!existsSync(full)) {
        if (file === SETTINGS_FILES[0]) return undefined;
        continue;
      }

      for (const group of groupsOf(JSON.parse(readFileSync(full, 'utf8')), home)) groups.set(group.key, group);
    }
  } catch {
    return undefined;
  }

  return groups;
}
