/**
 * How long an agent has HELD uncommitted work: the pure arithmetic over a `git status --porcelain -z` text, the
 * modification time of each dirty path, the moment the agent arrived and the committer time of its last commit.
 *
 * WHICH PATHS COUNT, AND WHY.
 *   - A path last modified BEFORE the agent arrived was left by an earlier actor. It is skipped: the agent did
 *     not write it, so the clock cannot run against it, and counting it would refuse a resumed agent for a
 *     predecessor's leftovers it may rightly not commit.
 *   - A path the agent did write but left dirty across one of its own commits is counted from that commit, never
 *     from its older mtime: the age resets the moment a commit lands, and what the commit left behind starts a
 *     new clock.
 *   - A path with no modification time (a deletion, a vanished file) cannot be dated and is skipped; stated, not
 *     hidden.
 *
 * @es Cuánto tiempo lleva un agente SOSTENIENDO trabajo sin commitear: aritmética pura sobre el texto de
 * `git status --porcelain -z`, el mtime de cada ruta sucia, el momento en que llegó el agente y la hora del
 * último commit. Una ruta modificada ANTES de que llegara el agente la dejó un actor anterior: se omite, porque
 * el agente no la escribió. Una ruta que el agente escribió y dejó sucia tras un commit propio cuenta desde ese
 * commit, no desde su mtime viejo: la edad se reinicia al aterrizar un commit. Una ruta sin mtime (un borrado)
 * no se puede fechar y se omite; se dice, no se esconde.
 */

/** The status codes whose entry is followed by the path it came from. @es Los códigos cuya entrada va seguida de la ruta de origen. */
const HAS_ORIGIN = new Set(['R', 'C']);

/**
 * The paths a NUL-separated porcelain v1 status lists, renames and copies reported by their new path.
 * @es Las rutas que lista un status porcelain v1 separado por NUL; un renombre se informa por su ruta nueva.
 */
export function porcelainPaths(output) {
  const entries = output.split('\0');
  const paths = [];

  for (let at = 0; at < entries.length; at += 1) {
    const entry = entries[at];

    if (entry.length < 4) continue;

    paths.push(entry.slice(3));
    if (HAS_ORIGIN.has(entry[0]) || HAS_ORIGIN.has(entry[1])) at += 1;
  }

  return paths;
}

/**
 * The counted paths with the moment each one's clock started, oldest first.
 * @param dated `[{ path, modifiedMs }]`, `modifiedMs` being `undefined` for a path with no modification time.
 * @es Las rutas que cuentan con el momento en que empezó el reloj de cada una, la más vieja primero.
 */
export function heldPaths(dated, { arrivalMs, lastCommitMs }) {
  return dated
    .filter(({ modifiedMs }) => modifiedMs >= arrivalMs) // `undefined >= n` is false: an undated path drops out here
    .map(({ path: where, modifiedMs }) => ({ path: where, sinceMs: Math.max(modifiedMs, lastCommitMs) }))
    .sort((a, b) => a.sinceMs - b.sinceMs);
}
