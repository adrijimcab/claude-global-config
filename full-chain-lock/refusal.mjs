/**
 * The bilingual refusal of the full-chain guard, in the house form: it names the offending command and the exact
 * runner command that replaces it (`node "<runner>" --chain <chain> --project <project> --session <id> -- <command>`).
 * The runner path is spelled with forward slashes, which both Bash and PowerShell accept for `node`.
 *
 * @es La negativa bilingüe del guard de cadenas completas: nombra el comando infractor y el comando exacto del
 * runner que lo reemplaza. La ruta del runner lleva barras normales, que aceptan Bash y PowerShell.
 */

import { fileURLToPath } from 'node:url';

import { DEFAULT_WAIT_SECONDS } from './chain-runner.mjs';
import { speak } from './messages.mjs';
import { wrappedTree } from './wrapped-tree.mjs';

/** The runner that wraps a chain, as an absolute path with forward slashes. @es El runner que envuelve una cadena, ruta absoluta con barras normales. */
const RUNNER = fileURLToPath(new URL('./run.mjs', import.meta.url)).split('\\').join('/');

/**
 * The command that runs `offender` through the lock. `--project` is named only when ONE project declares the chain;
 * otherwise the runner records the directory it runs in, which is the true project.
 * @es El comando que ejecuta `offender` por el lock. `--project` se nombra solo si UN proyecto declara la cadena; si
 * no, el runner registra el directorio donde corre, que es el proyecto verdadero.
 */
export function wrappedCommand({ chain, projects, text }, session, tree) {
  const projectFlag = projects.length === 1 ? ` --project ${projects[0]}` : '';
  const sessionFlag = session === undefined ? '' : ` --session ${session}`;
  const treeFlag = tree === undefined ? '' : ` --tree "${tree}"`;

  return `node "${RUNNER}" --chain ${chain}${projectFlag}${sessionFlag}${treeFlag} -- ${text}`;
}

/**
 * @param {{ chain: string, projects: string[], text: string }} offender The first unwrapped full chain of the line.
 * @param {string|undefined} session The calling session, recorded in the lock's holder record.
 * @param {{ cwd?: string, dialect?: string, script?: string }} [context] The call's directory, shell dialect and whole line, from which the tree the chain measures is named.
 * @param {{ topLevelOf?: (directory: string) => (string|undefined) }} [seams] Replaces the git question (a test seam).
 * @returns {string} The rendered refusal, English then ` @es ` Spanish. When the tree cannot be named it carries no runner command, only the explanation.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `. Si no se puede nombrar el árbol no lleva comando del runner, solo la explicación.
 */
export function refusalText(offender, session, context = {}, seams = {}) {
  const tree = wrappedTree(offender, context, seams);
  const params = {
    command: offender.text,
    chain: offender.chain,
    project: offender.projects.join(' / '),
    defaultWaitSeconds: DEFAULT_WAIT_SECONDS
  };

  return tree === undefined ? speak().line('refusal-tree-unknown', params) : speak().line('refusal', { ...params, wrapped: wrappedCommand(offender, session, tree) });
}
