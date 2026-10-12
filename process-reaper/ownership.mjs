/**
 * Whether a process command line belongs to a closed agent: it names the agent's worktree, its id or its
 * scratch directory. The ONE definition of "belongs", so a wider or narrower match is a change to this file
 * only. Every name is matched with a boundary on both sides, because a worktree `wt-a` must not claim the
 * processes of `wt-a-two`, and an id must not claim a longer word that merely contains it. A name that is
 * blank, or an id too short to be an identity, is no marker at all: the empty string is contained in every
 * command line, and a marker that matches everything would kill every process of every session.
 * @es Si la línea de comandos de un proceso pertenece a un agente cerrado: nombra su worktree, su id o su
 * directorio de scratch. La ÚNICA definición de «pertenece», así que un criterio más ancho o más estrecho es un
 * cambio solo de este fichero. Cada nombre se busca con límite a ambos lados: un worktree `wt-a` no debe
 * reclamar los procesos de `wt-a-two`, ni un id una palabra más larga que lo contiene. Un nombre en blanco, o un
 * id demasiado corto para ser una identidad, no es un marcador: la cadena vacía está contenida en toda línea de
 * comandos, y un marcador que coincide con todo mataría todos los procesos de todas las sesiones.
 */

/** An agent id shorter than this is not an identity (real ones are 17 hex digits). @es Un id más corto no es una identidad. */
export const MINIMUM_ID_LENGTH = 8;

const AGENT_PREFIX = 'agent-';
const PATH_NAME_CHARACTER = /[a-z0-9_.-]/;
const ID_CHARACTER = /[a-z0-9]/;

/** The text compared: lower case, one slash spelling. @es El texto comparado: minúsculas, una sola forma de barra. */
const normalized = (text) => text.split('\\').join('/').toLowerCase();

/** A path as a marker, without its trailing slashes, or `undefined` when it is blank. @es Una ruta como marcador. */
function pathMarker(value) {
  if (typeof value !== 'string') return undefined;

  const text = normalized(value.trim()).replace(/\/+$/, '');

  return text === '' ? undefined : { text, continues: (character) => PATH_NAME_CHARACTER.test(character) };
}

/** An agent id as a marker, or `undefined` when it is blank or too short to be one. @es Un id como marcador. */
function idMarker(value) {
  if (typeof value !== 'string') return undefined;

  const lowered = value.trim().toLowerCase();
  const id = lowered.startsWith(AGENT_PREFIX) ? lowered.slice(AGENT_PREFIX.length) : lowered;

  return id.length < MINIMUM_ID_LENGTH || !/^[a-z0-9]+$/.test(id) ? undefined : { text: id, continues: (character) => ID_CHARACTER.test(character) };
}

/**
 * The markers of an agent: `{ worktree, agentId, scratch }`, each optional.
 * @es Los marcadores de un agente: `{ worktree, agentId, scratch }`, cada uno opcional.
 */
export function markersOf({ worktree, agentId, scratch } = {}) {
  return [pathMarker(worktree), idMarker(agentId), pathMarker(scratch)].filter((marker) => marker !== undefined);
}

/** Whether `marker` occurs in `line` with a boundary on both sides. @es Si el marcador aparece con límite a ambos lados. */
function occursIn(marker, line) {
  for (let at = line.indexOf(marker.text); at !== -1; at = line.indexOf(marker.text, at + 1)) {
    const before = line.charAt(at - 1);
    const after = line.charAt(at + marker.text.length);
    const bounded = (before === '' || !marker.continues(before)) && (after === '' || !marker.continues(after));

    if (bounded) return true;
  }

  return false;
}

/** Whether the command line names any of the markers. @es Si la línea de comandos nombra alguno de los marcadores. */
export function namesAny(markers, commandLine) {
  const line = normalized(commandLine);

  return markers.some((marker) => occursIn(marker, line));
}
