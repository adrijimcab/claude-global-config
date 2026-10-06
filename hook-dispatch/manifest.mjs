/**
 * El manifiesto de un dispatcher: qué guardias corre, para qué evento y con qué matcher cada una.
 *
 * El matcher de cada guardia NO se repite en el manifiesto: se lee de su propio
 * `<guardia>.hook-registration.json`, que ya es la fuente única de «dónde tiene que estar cableada»
 * (la usa `hook-registration-selfcheck`). Así el dispatcher corre `install-guard.mjs` solo en Bash,
 * igual que cuando tenía su propia entrada con matcher `Bash`, sin un segundo lugar que se desincronice.
 * Una guardia sin sidecar corre para toda herramienta que llegue al dispatcher: ante la duda, corre.
 */

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Las alternativas de un matcher literal (`|` y `,` separan, como documenta Claude Code). */
export function alternativesOf(matcher) {
  if (typeof matcher !== 'string') return [];

  return matcher
    .split(',')
    .join('|')
    .split('|')
    .map((alternative) => alternative.trim())
    .filter((alternative) => alternative.length > 0);
}

/**
 * Si una guardia debe correr para `toolName`, según sus registros para `event`. Sin registros para ese
 * evento, o con un matcher vacío o `*`, corre siempre.
 */
export function appliesTo(registrations, event, toolName) {
  const forEvent = (registrations ?? []).filter((registration) => registration?.event === event);

  if (forEvent.length === 0) return true;

  return forEvent.some((registration) => {
    const alternatives = alternativesOf(registration.matcher);

    return alternatives.length === 0 || alternatives.includes('*') || alternatives.includes(toolName);
  });
}

/**
 * El rótulo con que una guardia firma su razón cuando se fusiona con otras: `<carpeta>/<archivo>`.
 * Sale del ARCHIVO, no de cómo lo escribe el manifiesto, para que el mismo guardia se llame igual se lo
 * cite como se lo cite (`../gate-run/guard.mjs`, una ruta absoluta, la de settings).
 */
export function labelOf(file) {
  return `${path.basename(path.dirname(file))}/${path.basename(file)}`;
}

/**
 * El mecanismo de una guardia: la carpeta que la contiene (`type-assertion-guard/guard.mjs` →
 * `type-assertion-guard`), el nombre de su directorio de estado y de `dismiss.mjs --mechanism`.
 */
export function mechanismOf(file) {
  return path.basename(path.dirname(file));
}

/** Los registros declarados por la guardia, o `undefined` si no tiene sidecar legible. */
function declaredRegistrations(guardFile) {
  const sidecar = `${guardFile}.hook-registration.json`;

  if (!existsSync(sidecar)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(sidecar, 'utf8'));

    return Array.isArray(parsed?.registrations) ? parsed.registrations : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Lee y valida el manifiesto. Lanza con un mensaje que nombra el problema: un manifiesto roto no es
 * «cero guardias», es un dispatcher que no puede medir, y eso se dice en voz alta.
 */
export function loadManifest(manifestFile) {
  const parsed = JSON.parse(readFileSync(manifestFile, 'utf8'));

  if (typeof parsed?.event !== 'string') throw new Error(`${manifestFile}: falta 'event'`);
  if (!Array.isArray(parsed.guards) || parsed.guards.length === 0) throw new Error(`${manifestFile}: 'guards' vacío o ausente`);

  const base = path.dirname(manifestFile);

  return {
    event: parsed.event,
    guards: parsed.guards.map((entry) => {
      const file = resolveGuard(entry, base);

      return { name: labelOf(file), mechanism: mechanismOf(file), file, registrations: declaredRegistrations(file) };
    }),
  };
}

/**
 * El home contra el que se resuelve `~/`. Es `HOOK_DISPATCH_HOME` cuando está definida, para que
 * `replay.mjs` corra el camino nuevo sobre un ESPEJO del home sin tocar el estado vivo de sus guardias;
 * el home real en cualquier otro caso.
 */
export const dispatchHome = () => process.env.HOOK_DISPATCH_HOME ?? os.homedir();

/**
 * La ruta absoluta de una guardia del manifiesto: `~/…` bajo el home (guardias de usuario registradas por
 * un proyecto, como `~/.claude/brief-provenance/guard.mjs`), y cualquier otra relativa al manifiesto.
 */
export function resolveGuard(entry, base) {
  return entry.startsWith('~/') ? path.join(dispatchHome(), entry.slice(2)) : path.resolve(base, entry);
}
