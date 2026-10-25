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
 * WHAT IS OWNED. A path the journal vouches for (recorded, exists, born after the record), or anything below such
 * a path (a folder the agent made owns what it holds); and the agent's own tenancy worktree (`own-tree.mjs`).
 * Writing a file INTO a folder does not make the folder the agent's. The shared scratchpad root is therefore
 * never owned, and a folder is the agent's only if it made the folder.
 *
 * @es QUIÉN CREÓ QUÉ, por efecto. Convierte una llamada en las rutas que está a punto de CREAR y el journal del
 * agente en la pregunta del guard: «¿es esta ruta del agente?». UNA LLAMADA CREA: el objetivo de `Write` o
 * `MultiEdit`; una redirección, `tee`, el destino de `cp`/`mv` y los cmdlets de contenido (parser compartido);
 * `mkdir`, `touch`, `New-Item` y el fichero que una copia o un movimiento deja en una carpeta existente. NO crea:
 * el objetivo de `Edit`/`NotebookEdit` ni de `sed -i`. Solo se anota un objetivo que NO existe al llamar
 * (`pendingCreations`), lo que hace de la reclamación un hecho del sistema de ficheros: un comando que solo NOMBRA
 * una ruta existente no reclama nada. ES PROPIO: lo que el journal avala (anotado, existe, nació después) o lo que
 * cuelga de ello, y el worktree de tenencia del agente. Escribir un fichero DENTRO de una carpeta no la hace del
 * agente: la raíz compartida del scratchpad nunca es propia.
 */

import { lstatSync } from 'node:fs';

import { toolCallWrites, callDirectory } from '../write-targets/tool-call-writes.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { canonical } from '../shared-temp-guard/shared-temp-targets.mjs';
import { vouchedFor } from './authored-journal.mjs';
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
 * The ownership the journal and the tenancy give: `owns` / `ownsCanonical` answer whether a path is the agent's.
 * @param {Map<string, number>} recorded The agent's journal (`readCreations`).
 * @param {string | undefined} ownTreeRoot The agent's own tenancy worktree, when it has one.
 * @es La propiedad que dan el journal y la tenencia.
 */
export function ownershipOf(recorded, ownTreeRoot) {
  const treeRoot = ownTreeRoot === undefined ? undefined : canonical(ownTreeRoot);

  /** Whether the canonical path, or any folder above it, is the tenancy worktree or is vouched for. @es Si la ruta, o alguna carpeta sobre ella, es el worktree de tenencia o está avalada. */
  const ownsCanonical = (canonicalPath) => {
    for (let current = canonicalPath; ; ) {
      if (current === treeRoot || vouchedFor(recorded, current)) return true;

      const slash = current.lastIndexOf('/');

      if (slash === -1) return false;

      current = current.slice(0, slash);
    }
  };

  return { ownsCanonical, owns: (candidate) => ownsCanonical(canonical(candidate)) };
}
