/**
 * The verdict of the shared-resource guard on one shell command from a DELEGATED worker: a refusal text, or
 * `undefined` to let it run. It does not ask who is calling (the guard does, once, with
 * `hook-caller/identify-caller.mjs`); it answers only "what does this project share, and does this line
 * control it?".
 *
 * ORDER. (1) find the project: `agent-contract-parity/project-root.mjs` resolves it the way every other
 * project-level guard does (the harness's project directory, the payload's `cwd`, and the main checkout of a
 * linked worktree, where the git-ignored `.claude/` of the project does not exist); no declaration file on
 * that path means the project shares nothing and the verdict is silence. (2) read the declaration
 * (`declaration.mjs`): a file that cannot be used refuses, naming every problem. (3) ask
 * `control-actions.mjs`; the first action found is the refusal.
 *
 * @es El veredicto del guard de recursos compartidos sobre un comando de shell de un worker DELEGADO: un
 * texto de rechazo o `undefined` para dejarlo correr. No pregunta quién llama (lo hace el guard, una vez);
 * responde «¿qué comparte este proyecto y esta línea lo controla?». Orden: (1) encontrar el proyecto como
 * lo hacen los demás guards de proyecto; sin fichero de declaración en ese camino, silencio. (2) leer la
 * declaración: un fichero inservible rechaza nombrando cada problema. (3) preguntar a `control-actions.mjs`;
 * la primera acción hallada es el rechazo.
 */

import { projectRootFor } from '../agent-contract-parity/project-root.mjs';
import { controlActions } from './control-actions.mjs';
import { readDeclaration, SHARED_RESOURCES_FILE } from './declaration.mjs';
import { pidsListeningOn } from './listeners.mjs';
import { actionRefusalText, invalidDeclarationText } from './refusal.mjs';

/**
 * @param {object} payload The parsed `PreToolUse` payload of a worker.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} command The shell line exactly as the tool received it.
 * @param {{ env?: object, listeners?: (port: number) => Set<string> }} [options] Injectable for proofs.
 * @returns {{ reason: string } | undefined} The refusal, or `undefined` to let the command run.
 * @es El rechazo, o `undefined` para dejar correr el comando.
 */
export function decide(payload, dialect, command, { env = process.env, listeners = pidsListeningOn } = {}) {
  const root = projectRootFor(payload, SHARED_RESOURCES_FILE, env);

  if (root === undefined) return undefined;

  const declaration = readDeclaration(root);

  if (declaration.status === 'absent') return undefined;
  if (declaration.status === 'invalid') return { reason: invalidDeclarationText(declaration.file, declaration.problems) };

  const [action] = controlActions(command, dialect, typeof payload.cwd === 'string' ? payload.cwd : process.cwd(), declaration.resources, listeners);

  return action === undefined ? undefined : { reason: actionRefusalText(action) };
}
