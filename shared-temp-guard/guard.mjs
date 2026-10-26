#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash, PowerShell, Write and Edit — shared-temp-guard. Refuses a write into the shared
 * TEMP root (`os.tmpdir()`, its Git Bash `/tmp`, any of their subdirectories except the Claude session tree
 * `<tmp>/claude/`) when the caller is a delegated SUBAGENT; the main session is never judged.
 *
 * MEASURED INCIDENTS. 2026-10-12: one worker read another session's `edit6.mjs`, and another committed with an
 * `m1.txt` message file a different session had overwritten. 2026-10-18 (second occurrence): a worker wrote its
 * mutant-campaign output to the shared `/tmp` and a peer's reaper campaign overwrote it. ROOT CAUSE: the TEMP root
 * is one directory for every live session and workers pick generic names; the worktree and the session
 * scratchpad are the places that belong to one actor.
 *
 * WHO IS A WORKER. `hook-caller/identify-caller.mjs`, the one definition the fleet shares.
 * WHAT IS A WRITE. `write-targets/tool-call-writes.mjs` (the Write/Edit target and every shell write target) plus
 * `option-writes.mjs` (`-o`/`--output` and `git commit -F`, which the vendored parser does not read).
 * WHAT IS THE ROOT. `shared-temp-targets.mjs`, which owns every spelling of it.
 *
 * FAILS OPEN on every malfunction of its own: a guard that cannot decide must not silence a safe command.
 *
 * @es Guardia `PreToolUse` sobre Bash, PowerShell, Write y Edit. Rechaza una escritura en la raíz TEMP compartida
 * cuando quien llama es un SUBAGENTE delegado; la sesión principal nunca se juzga. INCIDENTES MEDIDOS: el
 * 2026-10-12 un worker leyó el `edit6.mjs` de otra sesión y otro hizo commit con un `m1.txt` que otra sesión
 * había sobrescrito; el 2026-10-18 (segunda vez) un worker escribió la salida de su campaña de mutantes en el
 * `/tmp` compartido y la campaña de un par la sobrescribió. CAUSA RAÍZ: la raíz TEMP es un directorio para todas
 * las sesiones y los workers eligen nombres genéricos. Quién es worker lo decide `hook-caller`; qué es escritura,
 * `write-targets` y `option-writes.mjs`; cuál es la raíz, `shared-temp-targets.mjs`. Falla ABIERTO.
 */

import { deny, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { callDirectory, toolCallWrites } from '../write-targets/tool-call-writes.mjs';
import { optionWriteTargets } from './option-writes.mjs';
import { refusalText } from './refusal.mjs';
import { sharedTempOffenders, sharedTempRoots } from './shared-temp-targets.mjs';

/** Every write target of a call, over both channels and the option-named files. @es Cada destino de escritura de una llamada. */
function writeTargetsOf(payload) {
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;
  const optionNamed = dialect !== undefined && typeof command === 'string' ? optionWriteTargets(command, dialect, callDirectory(payload)) : [];

  return [...toolCallWrites(payload), ...optionNamed];
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to let the call run. Exported so the dispatcher
 * can run it in its own process. `decision` is injectable so a selftest can make it fail.
 * @es La salida de hook para un payload crudo, o `undefined` para dejar correr la llamada.
 */
export function evaluate(raw, decision = sharedTempOffenders) {
  const payload = tryParsePayload(raw);

  if (payload === undefined) return undefined;

  if (!isSubagentCaller(payload)) return undefined;

  let offenders;

  try {
    offenders = decision(writeTargetsOf(payload), sharedTempRoots());
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a call
  }

  if (offenders.length === 0) return undefined;

  return deny(refusalText(offenders[0].path, offenders[0].via));
}

runWhenMain(import.meta.url, hookMain(evaluate));
