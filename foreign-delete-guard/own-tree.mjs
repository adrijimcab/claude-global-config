/**
 * The worktree an agent was GIVEN: its tenancy. Deleting inside the worktree an agent was assigned is ordinary
 * work on its own tree (a refactor removes tracked files, a build output is rebuilt), so it is not what this
 * guard protects. What it protects is every folder SHARED between actors: the session scratchpad root, the main
 * checkout, the temp root, and any other actor's worktree.
 *
 * WHAT COUNTS AS THE AGENT'S TENANCY, and nothing looser. The linked worktree its working directory stands in,
 * when one of these two records, both kept by the fleet and only read here, says it is the agent's:
 *   - the harness's own record for an isolated agent: `agent-<id>.meta.json` carries its `worktreePath`
 *     (`agent-liveness/liveness.mjs` `agentRecords`); or
 *   - the `TENANCY:` lines of the brief the agent was given, read with the lines `brief-tenancy` enforces
 *     (`tenancyLines`) from the first record of the agent's transcript (`briefOf`), only for an agent whose meta
 *     names no worktree. The declaration must carry the worktree's FULL PATH: a bare folder name matches a
 *     same-named worktree anywhere, so it grants nothing.
 * No record, or a record for another worktree, means no exemption. The record is found by the agent's id, never
 * by the payload's `transcript_path`, which a subagent payload may point at the main session's transcript.
 *
 * A LINKED WORKTREE, not any `.git` file. Git keeps `.git` as a file in a linked worktree (`gitdir: <repo>/.git/
 * worktrees/<name>`) and also in a submodule (`gitdir: <repo>/.git/modules/<name>`). Only the first is a worktree
 * an agent can be given; the walk checks where the `gitdir:` points. File-system reads only, no git process.
 *
 * @es El worktree que se le DIO a un agente: su tenencia. Borrar dentro del worktree asignado es trabajo
 * ordinario sobre su propio árbol; lo que este guard protege son las carpetas COMPARTIDAS entre actores: la raíz
 * del scratchpad, el checkout principal, la raíz temporal y el worktree de cualquier otro actor. ES SU TENENCIA,
 * y nada más laxo: el worktree enlazado en que está su directorio de trabajo cuando uno de estos dos registros de
 * la flota (solo se leen) dice que es suyo: el `worktreePath` del `meta.json` del harness para un agente aislado,
 * o las líneas `TENANCY:` de su brief leídas con las de `brief-tenancy` (`tenancyLines`) del primer registro de
 * su transcript, solo si el meta no nombra ningún worktree; la declaración debe llevar la RUTA COMPLETA, porque un
 * nombre de carpeta suelto casa con un worktree homónimo en cualquier sitio y no concede nada. Sin registro, o con registro de otro worktree, no
 * hay exención. El registro se busca por el id del agente, nunca por el `transcript_path` del payload. UN WORKTREE
 * ENLAZADO, no cualquier fichero `.git`: un submódulo también lo tiene como fichero (`.git/modules/...`); solo el
 * `gitdir:` que apunta a `.git/worktrees/` es un worktree que se le puede dar a un agente.
 */

import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { agentRecords, briefOf } from '../agent-liveness/liveness.mjs';
import { tenancyLines } from '../brief-tenancy/tenancy-declaration.mjs';
import { nativeSpelling } from '../cherry-pick-guard/working-directory.mjs';
import { canonical } from '../shared-temp-guard/shared-temp-targets.mjs';

/** The folder pair in a linked worktree's `gitdir:` line. @es El par de carpetas en la línea `gitdir:` de un worktree enlazado. */
const LINKED_GITDIR_MARK = '/.git/worktrees/';

/** Whether the `.git` file at `gitFile` points into a repository's `.git/worktrees/`. @es Si el fichero `.git` apunta a `.git/worktrees/`. */
function pointsIntoWorktrees(gitFile) {
  try {
    const line = readFileSync(gitFile, 'utf8').split('\n')[0].trim();

    return line.startsWith('gitdir:') && line.slice('gitdir:'.length).split('\\').join('/').includes(LINKED_GITDIR_MARK);
  } catch {
    return false;
  }
}

/**
 * @param {string} cwd The agent's working directory.
 * @returns {string | undefined} The root of the LINKED worktree it stands in, or `undefined` for the main checkout, a submodule or no repository.
 * @es La raíz del worktree ENLAZADO en que está, o `undefined` para el checkout principal, un submódulo o ningún repositorio.
 */
export function linkedWorktreeRoot(cwd) {
  for (let current = path.resolve(cwd); ; ) {
    try {
      const gitEntry = path.join(current, '.git');

      return lstatSync(gitEntry).isFile() && pointsIntoWorktrees(gitEntry) ? current : undefined;
    } catch {
      const parent = path.dirname(current);

      if (parent === current) return undefined;

      current = parent;
    }
  }
}

/**
 * @param {{ cwd: string, agentKey: string, records?: () => Array<object> }} input The agent and where it stands.
 * @returns {string | undefined} The root of the worktree the fleet's records give the agent, or `undefined`.
 * @es La raíz del worktree que los registros de la flota dan al agente, o `undefined`.
 */
export function tenancyWorktree({ cwd, agentKey, records = agentRecords }) {
  const root = linkedWorktreeRoot(cwd);

  if (root === undefined) return undefined;

  const record = records().find((candidate) => candidate.id === `agent-${agentKey}`);

  if (record === undefined) return undefined;
  if (record.worktreePath !== '') return canonical(record.worktreePath) === canonical(root) ? root : undefined;

  return declaredPaths(briefOf(record.transcript)).includes(canonical(root)) ? root : undefined;
}

/** The characters that separate the words of a `TENANCY:` declaration. @es Los caracteres que separan las palabras de una declaración `TENANCY:`. */
const WORD_SEPARATORS = ' \t\r,;"\'`()';

/**
 * The absolute paths a brief's `TENANCY:` lines declare, canonical. A word counts only if it is an absolute path
 * (a drive path or one starting with a slash, Git Bash spellings translated): a line that names a worktree only by
 * its folder name declares no path, so it grants nothing, and a same-named worktree elsewhere never matches. The
 * lines are the ones `brief-tenancy` enforces (`tenancyLines`).
 * @es Las rutas absolutas que declaran las líneas `TENANCY:` de un brief, en forma canónica. Una palabra cuenta solo
 * si es una ruta absoluta: una línea que nombra un worktree solo por el nombre de su carpeta no declara ninguna
 * ruta y no concede nada, y un worktree homónimo en otro sitio nunca casa. Las líneas son las que exige
 * `brief-tenancy` (`tenancyLines`).
 */
export function declaredPaths(briefText) {
  const declared = [];

  for (const rest of tenancyLines(briefText)) {
    const colon = rest.indexOf(':');

    if (colon === -1) continue;

    let word = '';

    for (const character of `${rest.slice(colon + 1)} `) {
      if (!WORD_SEPARATORS.includes(character)) {
        word += character;
        continue;
      }

      const native = nativeSpelling(word);

      if (word.length > 0 && path.isAbsolute(native)) declared.push(canonical(native));

      word = '';
    }
  }

  return declared;
}
