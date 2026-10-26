/**
 * The instructed git commands that `worker-git-guard` refuses to every delegated worker: ONE decision, read at
 * two moments. `worker-git-guard/forbidden-invocations.mjs` decides at run time, when the worker types the
 * command; this module asks the same function at delegation time, over each command a brief instructs, so a brief
 * that orders `git switch` or `git checkout -- <path>` is refused before a worker is spawned to hit the wall.
 *
 * WHY THE SAME FUNCTION, NOT A COPY. Before this module brief-feasibility read only the permission deny lists, and
 * `git switch` is on none of them: it is refused by the guard's parser, by family. A second list of "git commands a
 * worker may not run" would drift from the guard the first time either changes; importing the guard's decision
 * cannot. `brief-feasibility/worker-git.selftest.mjs` proves the parity: every command the guard's own selftest
 * refuses, written into a brief, is refused here.
 *
 * WHICH SHELL. A brief does not say whether the worker will reach for Bash or PowerShell, so a command counts when
 * the guard refuses it in either dialect (the deny-list face reads both tool prefixes for the same reason).
 *
 * WHERE. The guard reads the repository layout from the directory the command runs in (a commit's pathspec, an
 * index file); the worker's directory is not known before it is spawned, so the main checkout the brief is sent
 * from stands in for it, the same root the deny-list face reads.
 *
 * FAILS OPEN when the decision throws on a script: a malfunction of the guard's parser must not block a delegation.
 *
 * @es Los comandos git ordenados que `worker-git-guard` rechaza a todo worker delegado: UNA decisión, leída en dos
 * momentos. `forbidden-invocations.mjs` decide al ejecutar; este módulo pregunta a la misma función al delegar, sobre
 * cada comando que ordena un brief. Es la misma función y no una copia porque una segunda lista derivaría del guard;
 * el selftest prueba la paridad. Cuenta en cualquiera de los dos dialectos, porque un brief no dice qué shell usará
 * el worker. El directorio es el checkout principal, el mismo que lee la cara de la lista deny. Falla abierto si la
 * decisión lanza.
 */

import { forbiddenInvocations } from '../worker-git-guard/forbidden-invocations.mjs';
import { MESSAGES } from '../worker-git-guard/refusal.mjs';

/** The dialects a brief's command may be run in. @es Los dialectos en que puede correr el comando de un brief. */
const DIALECTS = ['bash', 'powershell'];

/** The first paragraph of each half of a refusal that names the working route. @es El primer párrafo de cada mitad que nombra la ruta que funciona. */
const ROUTE_LEADS = { en: 'USE INSTEAD', es: 'USAR EN SU LUGAR' };

/** The first invocation the guard refuses in `script`, in either dialect, or `undefined`. @es La primera invocación que el guard rechaza, o `undefined`. */
function firstRefused(script, cwd, decide) {
  for (const dialect of DIALECTS) {
    let refused;

    try {
      refused = decide(script, dialect, cwd);
    } catch {
      refused = [];
    }

    if (refused.length > 0) return refused[0];
  }

  return undefined;
}

/** The working route the guard's own refusal gives for `family`, in both halves. @es La ruta que da la negativa del propio guard para `family`, en las dos mitades. */
export function routeOf(family) {
  const half = (language) => {
    const lines = MESSAGES[family][language];

    return lines.slice(lines.findIndex((line) => line.startsWith(ROUTE_LEADS[language]))).join(' ');
  };

  return `${half('en')} @es ${half('es')}`;
}

/**
 * Every instruction (from `instructedCommands`) whose script the guard refuses: `{ lineNumber, line, detail,
 * alternative }`, one per instruction. `decide` is the guard's decision, injectable for a proof of the fail-open.
 * @es Cada instrucción cuyo script rechaza el guard, una por instrucción. `decide` es la decisión del guard, inyectable.
 */
export function workerGitRefusals(instructions, cwd, decide = forbiddenInvocations) {
  return instructions.flatMap(({ lineNumber, line, script }) => {
    const refused = firstRefused(script, cwd, decide);

    if (refused === undefined) return [];

    return [{ lineNumber, line, detail: `\`${refused.text.trim()}\` is refused to every delegated worker by worker-git-guard (family ${refused.family}) @es worker-git-guard rechaza \`${refused.text.trim()}\` a todo worker delegado (familia ${refused.family})`, alternative: routeOf(refused.family) }];
  });
}
