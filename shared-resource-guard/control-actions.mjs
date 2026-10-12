/**
 * Which CONTROL ACTIONS on a declared shared resource a shell line performs: it starts it, stops it, or
 * reconfigures it. Using a resource (reading it, `curl`-ing it, running tests against it) is none of the three.
 *
 * ONE PARSE for the three questions: the line is read once by the shared shell parser
 * (`shell-command/shell-command.mjs`) with the directory each command runs in
 * (`cherry-pick-guard/working-directory.mjs`), so a mention (`echo node bin/www`, a heredoc, a comment) is
 * data and never an action, while one inside `$(...)`, `bash -c`, a chain or a subshell runs and counts. Each
 * question has one module that owns it: `start-match.mjs`, `stop-match.mjs`, `reconfigure-match.mjs`.
 *
 * @es Qué ACCIONES DE CONTROL sobre un recurso compartido declarado hace una línea de shell: lo arranca, lo
 * detiene o lo reconfigura. Usarlo (leerlo, hacerle `curl`, correr tests contra él) no es ninguna. Un solo
 * análisis de la línea con el parser compartido y el directorio de cada comando, así que una mención es dato
 * y no una acción, y lo que corre dentro de `$(...)`, `bash -c`, una cadena o un subshell cuenta. Cada
 * pregunta tiene un módulo dueño: arrancar, detener y reconfigurar.
 */

import { withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { simpleCommands } from '../shell-command/shell-command.mjs';
import { reconfiguredNames } from './reconfigure-match.mjs';
import { startsResource } from './start-match.mjs';
import { stopRoute } from './stop-match.mjs';

/** The kinds of control action. @es Los tipos de acción de control. */
export const ACTION_KINDS = Object.freeze({ START: 'start', STOP: 'stop', RECONFIGURE: 'reconfigure' });

/** A port-to-PIDs lookup that asks the system once per port. @es Una búsqueda puerto-a-PIDs que pregunta al sistema una vez por puerto. */
function memoized(listeners) {
  const known = new Map();

  return (port) => {
    if (!known.has(port)) known.set(port, listeners(port));

    return known.get(port);
  };
}

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @param {object[]} resources The resources of a valid declaration (`declaration.mjs`).
 * @param {(port: number) => Set<string>} listeners PIDs listening on a port right now.
 * @returns {Array<{ resource: string, description: string, kind: string, detail: string, text: string }>}
 *   The control actions, in execution order; empty when the line only uses the resources.
 * @es Las acciones de control, en orden de ejecución; vacío si la línea solo usa los recursos.
 */
export function controlActions(script, dialect, cwd, resources, listeners, platform = process.platform) {
  const paired = withWorkingDirectories(simpleCommands(script, dialect), cwd, dialect, platform);
  const scriptWords = paired.flatMap(({ command }) => command.words);
  const knownListeners = memoized(listeners);
  const actions = [];

  paired.forEach(({ command, directory }, index) => {
    const nextWords = paired[index + 1]?.command.words ?? [];

    for (const resource of resources) {
      const found = (kind, detail) => actions.push({ resource: resource.name, description: resource.description, kind, detail, text: command.text.trim() });
      const route = stopRoute(command.words, scriptWords, resource, knownListeners, platform);

      if (startsResource(command.words, directory, resource, platform)) found(ACTION_KINDS.START, 'start-command');
      if (route !== undefined) found(ACTION_KINDS.STOP, route);

      for (const name of reconfiguredNames(command.words, nextWords, resource)) found(ACTION_KINDS.RECONFIGURE, `env=${name}`);
    }
  });

  return actions;
}
