/**
 * WHO CREATED WHAT: the set of paths a delegated agent authored in its session, read from the one journal the
 * harness already keeps per agent, its own transcript (`<session>/subagents/agent-<id>.jsonl`). Every tool call
 * the agent made is a `tool_use` record there with the tool's input, so no second store is built and nothing has
 * to be written at run time. MEASURED 2026-10-25: the record of a call is already in the transcript when the
 * agent's next call reaches `PreToolUse`, and every record carries its `cwd`.
 *
 * WHY NOT `config-sync-guard/authored-writes.mjs`. That journal is keyed `{ path, mtimeMs, session }` and only the
 * lessons-ledger tool writes to it; no agent's writes reach it (checked: its only writer is
 * `recordAuthoredWrites`, called from the ledger tool). It answers "which session wrote this configuration file",
 * a different question. The transcript answers "what did this agent create", and its structured-write reader
 * (`config-sync-guard/transcript-writes.mjs`) only knows file-writing tools, not the shell, so the shared
 * write parser (`write-targets/`) is reused on the transcript's calls instead.
 *
 * WHAT COUNTS AS CREATED. A `Write` call; a shell redirect, `tee`, `cp`/`mv` destination and the PowerShell
 * content cmdlets (`write-targets/`); `mkdir`, `touch`, `New-Item` (`creation-targets.mjs`). NOT created: an
 * `Edit`/`MultiEdit`/`NotebookEdit` target and a `sed -i` target (both changed a file that already existed), a
 * read, a mention. A `Write` over a file someone else made counts as authored: the transcript cannot tell create
 * from overwrite, and the agent did replace that content.
 *
 * WHAT COUNTS AS OWNED. An authored path and everything below it: a folder the agent made with `mkdir` or
 * `New-Item` owns whatever a child process drops in it (its "own scratchpad subfolder", the place to run a
 * program and clean up after it), and so does a `cp -r` destination; and the agent's own linked worktree
 * (`own-tree.mjs`). Writing a file INTO a folder does not make the folder the agent's: the folder may be shared
 * with the orchestrator or a sibling, and an implicit claim would let one `Write` hand the agent every file its
 * neighbours keep there. A claim must be explicit, by making the folder.
 *
 * @es QUIÉN CREÓ QUÉ: el conjunto de rutas que un agente delegado autoró en su sesión, leído del único registro
 * que el harness ya lleva por agente, su propio transcript. Cada llamada es un registro `tool_use` con su
 * entrada, así que no se construye un segundo almacén ni se escribe nada en ejecución. MEDIDO el 2026-10-25: el
 * registro de una llamada ya está en el transcript cuando llega la siguiente a `PreToolUse`, y cada registro
 * trae su `cwd`. NO SIRVE `authored-writes.mjs`: su único escritor es la herramienta del ledger de lecciones;
 * ninguna escritura de un agente llega allí. Y `transcript-writes.mjs` solo conoce herramientas de escritura, no
 * la shell, así que se reutiliza el parser de escrituras compartido sobre las llamadas del transcript. CREADO:
 * `Write`, redirección, `tee`, destino de `cp`/`mv`, cmdlets de contenido, `mkdir`, `touch`, `New-Item`; NO:
 * objetivo de `Edit`/`MultiEdit`/`NotebookEdit` ni de `sed -i`, lecturas, menciones. PROPIO: una ruta autorada y
 * todo lo que cuelga de ella: una carpeta que el agente hizo con `mkdir` o `New-Item` posee lo que un proceso
 * hijo deje en ella (su «subcarpeta propia del scratchpad»), igual que el destino de un `cp -r`; y su worktree
 * enlazado. Escribir un fichero DENTRO de una carpeta no la hace del agente: puede ser compartida con el
 * orquestador o un par, y una reclamación implícita le daría al agente todo lo que sus vecinos guardan allí. La
 * reclamación debe ser explícita, creando la carpeta.
 */

import { toolCallWrites, callDirectory } from '../write-targets/tool-call-writes.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { canonical } from '../shared-temp-guard/shared-temp-targets.mjs';
import { creationTargets } from './creation-targets.mjs';

/** The `via` the shared write parser gives the `Write` tool and `sed -i`. @es El `via` del parser compartido para `Write` y `sed -i`. */
const WRITE_TOOL_VIA = 'the Write tool';
const SED_VIA = 'sed -i';

/** Whether a reported write CREATED its file: a Write, or a shell write that is not an in-place edit. @es Si una escritura creó su fichero. */
const createdFile = (write) => typeof write.path === 'string' && (write.channel === 'edit' ? write.via === WRITE_TOOL_VIA : write.via !== SED_VIA);

/**
 * Every absolute path one tool call creates.
 * @param {{ tool_name?: string, tool_input?: unknown, cwd?: string }} call A `PreToolUse`-shaped call.
 * @es Cada ruta absoluta que crea una llamada.
 */
export function authoredByCall(call) {
  const written = toolCallWrites(call).filter(createdFile).map((write) => write.path);
  const dialect = dialectOfTool(call?.tool_name);
  const command = call?.tool_input?.command;
  const created = dialect !== undefined && typeof command === 'string' ? creationTargets(command, dialect, callDirectory(call)).map((entry) => entry.path) : [];

  return [...written, ...created];
}

/**
 * Every path the transcript's agent created, in order. A line that is not JSON is skipped: a half-written last
 * line must not hide what came before. `fallbackCwd` resolves the calls of a record that carries no `cwd`.
 * @es Cada ruta que creó el agente del transcript. Una línea que no es JSON se salta.
 */
export function authoredPathsIn(transcriptText, fallbackCwd) {
  const authored = [];

  for (const line of transcriptText.split('\n')) {
    let record;

    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const blocks = Array.isArray(record?.message?.content) ? record.message.content : [];
    const cwd = typeof record?.cwd === 'string' && record.cwd.length > 0 ? record.cwd : fallbackCwd;

    for (const block of blocks) {
      if (block?.type === 'tool_use') authored.push(...authoredByCall({ tool_name: block.name, tool_input: block.input, cwd }));
    }
  }

  return authored;
}

/**
 * The ownership the authored paths give: `owns` / `ownsCanonical` answer whether a path is the agent's.
 * @param {string[]} authored Absolute paths the agent created.
 * @param {string | undefined} ownTreeRoot The agent's own linked worktree root, when it has one.
 * @es La propiedad que dan las rutas autoradas.
 */
export function ownershipOf(authored, ownTreeRoot) {
  const roots = new Set();

  for (const file of authored) roots.add(canonical(file));

  if (ownTreeRoot !== undefined) roots.add(canonical(ownTreeRoot));

  /** Whether the canonical path, or any folder above it, is a root. @es Si la ruta canónica, o alguna carpeta sobre ella, es una raíz. */
  const ownsCanonical = (canonicalPath) => {
    for (let current = canonicalPath; ; ) {
      if (roots.has(current)) return true;

      const slash = current.lastIndexOf('/');

      if (slash === -1) return false;

      current = current.slice(0, slash);
    }
  };

  return { ownsCanonical, owns: (candidate) => ownsCanonical(canonical(candidate)) };
}
