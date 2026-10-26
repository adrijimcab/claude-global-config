/**
 * WHO CREATED WHAT, by effect. This module turns one tool call into the paths it is about to CREATE, and turns the
 * agent's journal (`authored-journal.mjs`) into the question the guard asks: "is this path the agent's?".
 *
 * WHAT A CALL CREATES. A `Write` or `MultiEdit` target; a shell redirect, `tee` and `cp`/`mv` destination and the
 * PowerShell content cmdlets (`write-targets/`, the shared parser); `mkdir`, `touch`, `New-Item` and the file a
 * copy or move drops into an existing folder (`creation-targets.mjs`). NOT created: an `Edit`/`NotebookEdit`
 * target and a `sed -i` target (both change a file that already exists). Only a target that does NOT exist at the
 * moment of the call is recorded (`pendingCreations`), which is what makes the claim a fact about the file
 * system: a command that merely NAMES an existing path claims nothing.
 *
 * WHAT IS OWNED. A path the agent's journal confirmed and whose identity is unchanged; what lies below a folder it
 * made, only when it was born inside one of the agent's own call intervals; and the agent's own tenancy worktree
 * (`own-tree.mjs`). Writing a file INTO a folder does not make the folder the agent's, and a folder the agent made
 * does not capture what other actors put in it outside the agent's calls (`authored-journal.mjs`).
 *
 * @es QUIÉN CREÓ QUÉ, por efecto. Convierte una llamada en las rutas que está a punto de CREAR y el journal del
 * agente en la pregunta del guard: «¿es esta ruta del agente?». UNA LLAMADA CREA: el objetivo de `Write` o
 * `MultiEdit`; una redirección, `tee`, el destino de `cp`/`mv` y los cmdlets de contenido (parser compartido);
 * `mkdir`, `touch`, `New-Item` y el fichero que una copia o un movimiento deja en una carpeta existente. NO crea:
 * el objetivo de `Edit`/`NotebookEdit` ni de `sed -i`. Solo se anota un objetivo que NO existe al llamar
 * (`pendingCreations`), lo que hace de la reclamación un hecho del sistema de ficheros: un comando que solo NOMBRA
 * una ruta existente no reclama nada. ES PROPIO: una ruta que el journal del agente confirmó y cuya identidad no
 * cambió; lo que cuelga de una carpeta que él hizo, solo si nació dentro de un intervalo de sus propias llamadas; y
 * el worktree de tenencia del agente. Escribir un fichero DENTRO de una carpeta no la hace del agente, y una
 * carpeta que él hizo no captura lo que otros actores ponen fuera de sus llamadas.
 */

import { lstatSync } from 'node:fs';

import { toolCallWrites, callDirectory } from '../write-targets/tool-call-writes.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { canonical } from '../shared-temp-guard/shared-temp-targets.mjs';
import { bornInside, identityOf, sameIdentity } from './authored-journal.mjs';
import { creationTargets } from './creation-targets.mjs';

/** The `via` the shared write parser gives the tools that create a file, and the in-place edit that does not. @es El `via` del parser compartido. */
const CREATING_TOOL_VIAS = new Set(['the Write tool', 'the MultiEdit tool']);
const SED_VIA = 'sed -i';

/** Whether a reported write CREATES its file: a creating tool, or a shell write that is not an in-place edit. @es Si una escritura CREA su fichero. */
const createsFile = (write) => typeof write.path === 'string' && (write.channel === 'edit' ? CREATING_TOOL_VIAS.has(write.via) : write.via !== SED_VIA);

/** Whether nothing exists at `target`, a link included. @es Si no existe nada en `target`, enlace incluido. */
function isAbsent(target) {
  try {
    lstatSync(target);

    return false;
  } catch {
    return true;
  }
}

/**
 * Every absolute path one tool call would create, existing or not.
 * @param {{ tool_name?: string, tool_input?: unknown, cwd?: string }} call A `PreToolUse`-shaped call.
 * @es Cada ruta absoluta que crearía una llamada, exista o no.
 */
export function creationsOfCall(call) {
  const written = toolCallWrites(call).filter(createsFile).map((write) => write.path);
  const dialect = dialectOfTool(call?.tool_name);
  const command = call?.tool_input?.command;
  const created = dialect !== undefined && typeof command === 'string' ? creationTargets(command, dialect, callDirectory(call)).map((entry) => entry.path) : [];

  return [...written, ...created];
}

/**
 * The canonical paths a call creates that do not exist now: what the journal records.
 * @es Las rutas canónicas que crea una llamada y que no existen ahora: lo que anota el journal.
 */
export function pendingCreations(call) {
  return [...new Set(creationsOfCall(call).filter(isAbsent).map((target) => canonical(target)))];
}

/**
 * The ownership the journal and the tenancy give: `ownsCanonical` answers whether a canonical path is the agent's.
 * A path is owned when it is the tenancy worktree or below it; when it is a confirmed path whose identity is
 * unchanged; or when it lies below such a confirmed folder AND was born inside one of the agent's own call
 * intervals (what its child processes dropped there).
 * @param {{ confirmed: Map<string, { id: string, born: number }>, intervals: Array<{ start: number, end: number }> }} journal The agent's journal (`readJournal`).
 * @param {string | undefined} ownTreeRoot The agent's own tenancy worktree, when it has one.
 * @param {Function} [identify] The identity reader, injectable.
 * @es La propiedad que dan el journal y la tenencia. Es propia la que está en el worktree de tenencia; una ruta
 * confirmada cuya identidad no cambió; o la que cuelga de una carpeta confirmada Y nació dentro de un intervalo
 * de las llamadas del propio agente (lo que dejaron sus procesos hijo).
 */
export function ownershipOf(journal, ownTreeRoot, identify = identityOf) {
  const treeRoot = ownTreeRoot === undefined ? undefined : canonical(ownTreeRoot);

  /** Whether the canonical path, or a confirmed folder above it, makes it the agent's. @es Si la ruta, o una carpeta confirmada sobre ella, la hace del agente. */
  const ownsCanonical = (canonicalPath) => {
    for (let current = canonicalPath; ; ) {
      if (current === treeRoot) return true;

      const confirmed = journal.confirmed.get(current);

      if (confirmed !== undefined && sameIdentity(current, confirmed, identify) && (current === canonicalPath || bornInside(canonicalPath, journal.intervals, identify))) return true;

      const slash = current.lastIndexOf('/');

      if (slash === -1) return false;

      current = current.slice(0, slash);
    }
  };

  return { ownsCanonical };
}
