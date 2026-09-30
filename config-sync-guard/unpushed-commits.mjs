/**
 * The commits a declared repo holds ahead of its remote, and whose work each one is.
 *
 * WHY ATTRIBUTE COMMITS. `ahead > 0` alone blocked every session, whoever made the commits. Measured
 * 2026-10-01: a session in another project was blocked four times by a DIFFERENT session's worker
 * commits and pushed those unverified commits each time. A commit is another actor's work, not this
 * session's obligation, when a live agent of ANOTHER session wrote every path it changes and no live
 * agent of THIS session wrote any of them. A commit nobody live owns (an empty one, a mixed one, one
 * whose log could not be read) stays blocking: fail toward BLOCK, like every measurement here. The guard
 * never pushes and never tells a session to push a commit it could not show to be its own.
 *
 * @es Los commits que un repo declarado tiene por delante de su remoto, y de quién es cada uno. Antes,
 * `ahead > 0` bloqueaba a toda sesión, hiciera quien hiciera los commits (medido el 2026-10-01: una sesión
 * de otro proyecto fue bloqueada cuatro veces por commits de workers de OTRA sesión y los subió sin
 * verificar). Un commit es trabajo ajeno cuando un agente vivo de OTRA sesión escribió cada ruta que toca
 * y ninguno vivo de ESTA sesión escribió alguna. Sin dueño vivo (vacío, mixto, log ilegible) sigue
 * bloqueando. La guardia nunca sube commits ni manda a subir uno que no pudo mostrar como propio.
 */

import { writersOf } from './attribution.mjs';

const COMMIT_MARK = '\x01';
const LOG_ARGS = ['-c', 'core.quotepath=off', 'log', '--name-only', `--format=${COMMIT_MARK}%h %s`, '@{u}..HEAD'];

/**
 * Parses the `git log --name-only` text `LOG_ARGS` requests into `[{ hash, subject, paths }]`, in git's own
 * order (newest first). Blank lines separate a header from its paths and carry nothing.
 * @es Parsea el texto de `git log --name-only` a `[{ hash, subject, paths }]`, en el orden de git.
 */
export function parseAheadLog(text) {
  const commits = [];

  for (const line of text.split('\n')) {
    if (line.startsWith(COMMIT_MARK)) {
      const header = line.slice(COMMIT_MARK.length);
      const space = header.indexOf(' ');

      commits.push({ hash: space === -1 ? header : header.slice(0, space), subject: space === -1 ? '' : header.slice(space + 1), paths: [] });
    } else if (line.length > 0 && commits.length > 0) {
      commits.at(-1).paths.push(line);
    }
  }

  return commits;
}

/** The commits ahead of `repo`'s remote, or `[]` when git could not list them (never read as "none ahead"). @es Los commits por delante del remoto, o `[]` si git no pudo listarlos. */
export function readAheadCommits(repo) {
  const log = repo.run(LOG_ARGS);

  return log.ok ? parseAheadLog(log.stdout) : [];
}

/**
 * Splits `commits` into `foreign` (another session's live agents own them: `owners` lists their ids) and
 * `unowned` (everything else: `writers` lists any live agent that wrote some of their paths, for the
 * message). With no known `sessionId`, "another session" cannot be told, so every commit is unowned.
 * @es Separa `commits` en `foreign` (de agentes vivos de otra sesión) y `unowned` (el resto). Sin
 * `sessionId` conocido, todo commit queda sin dueño.
 */
export function classifyCommits(commits, liveAgents, sessionId) {
  const foreign = [];
  const unowned = [];

  for (const commit of commits) {
    const writers = commit.paths.map((commitPath) => writersOf(commitPath, liveAgents));
    const writerIds = [...new Set(writers.flat().map((writer) => writer.id))];
    const coveredByLiveAgents = commit.paths.length > 0 && writers.every((pathWriters) => pathWriters.length > 0);
    const touchedByThisSession = writers.flat().some((writer) => writer.session === sessionId);

    if (typeof sessionId === 'string' && coveredByLiveAgents && !touchedByThisSession) foreign.push({ ...commit, owners: writerIds });
    else unowned.push({ ...commit, writers: writerIds });
  }

  return { foreign, unowned };
}
