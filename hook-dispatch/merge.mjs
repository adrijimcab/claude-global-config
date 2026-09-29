/**
 * Fusión de las salidas de varias guardias en UNA salida de hook, con la misma precedencia que aplica
 * Claude Code cuando varios hooks responden al mismo evento: `deny` gana sobre `ask`, que gana sobre
 * `allow`. Ninguna razón se pierde: si dos guardias rechazan, el motivo lleva las dos, en el orden del
 * manifiesto y con el nombre de cada guardia, para que quien lee sepa a quién contestarle.
 *
 * Es un módulo puro (sin E/S) para que el selftest recorra todo su espacio de estados sin procesos.
 */

const PRECEDENCE = ['deny', 'ask', 'allow'];
const SEPARATOR = '\n\n────────\n\n';

/** Claves de nivel superior que esta fusión sabe combinar. Cualquier otra se informa como anomalía. */
const KNOWN_TOP_LEVEL = new Set(['hookSpecificOutput', 'decision', 'reason', 'systemMessage', 'continue', 'stopReason', 'suppressOutput']);
const KNOWN_SPECIFIC = new Set(['hookEventName', 'permissionDecision', 'permissionDecisionReason', 'additionalContext']);

/** Une textos no vacíos, rotulando cada uno con su guardia cuando hay más de uno. */
function joinLabelled(entries) {
  const present = entries.filter((entry) => typeof entry.text === 'string' && entry.text.length > 0);

  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0].text;

  return present.map((entry) => `[${entry.guard}]\n${entry.text}`).join(SEPARATOR);
}

/**
 * Devuelve `{ output, anomalies }`. `output` es `undefined` cuando ninguna guardia dijo nada, que es
 * exactamente lo que habría visto el harness con N procesos silenciosos. `anomalies` lista claves que
 * una guardia devolvió y esta fusión no sabe combinar: el dispatcher las reporta en stderr en vez de
 * descartarlas callado.
 */
export function mergeOutputs(eventName, results) {
  const anomalies = [];
  const decided = [];
  const contexts = [];
  const systemMessages = [];
  const blocks = [];
  let stop;
  let suppressOutput = false;

  for (const { guard, output } of results) {
    if (output === undefined || output === null) continue;

    if (typeof output !== 'object') {
      anomalies.push(`${guard}: devolvió ${typeof output}, no un objeto`);
      continue;
    }

    for (const key of Object.keys(output)) if (!KNOWN_TOP_LEVEL.has(key)) anomalies.push(`${guard}: clave desconocida '${key}'`);

    const specific = output.hookSpecificOutput;

    if (specific !== undefined) {
      for (const key of Object.keys(specific)) if (!KNOWN_SPECIFIC.has(key)) anomalies.push(`${guard}: clave desconocida 'hookSpecificOutput.${key}'`);

      if (PRECEDENCE.includes(specific.permissionDecision)) decided.push({ guard, decision: specific.permissionDecision, text: specific.permissionDecisionReason });
      if (typeof specific.additionalContext === 'string') contexts.push({ guard, text: specific.additionalContext });
    }

    if (output.decision === 'block') blocks.push({ guard, text: output.reason });
    if (typeof output.systemMessage === 'string') systemMessages.push({ guard, text: output.systemMessage });
    if (output.continue === false && stop === undefined) stop = { guard, stopReason: output.stopReason };
    if (output.suppressOutput === true) suppressOutput = true;
  }

  const merged = {};
  const winner = PRECEDENCE.find((decision) => decided.some((entry) => entry.decision === decision));

  if (winner !== undefined || contexts.length > 0) {
    merged.hookSpecificOutput = { hookEventName: eventName };

    if (winner !== undefined) {
      merged.hookSpecificOutput.permissionDecision = winner;

      const reason = joinLabelled(decided.filter((entry) => entry.decision === winner));

      if (reason !== undefined) merged.hookSpecificOutput.permissionDecisionReason = reason;
    }

    const context = joinLabelled(contexts);

    if (context !== undefined) merged.hookSpecificOutput.additionalContext = context;
  }

  if (blocks.length > 0) {
    merged.decision = 'block';

    const reason = joinLabelled(blocks);

    if (reason !== undefined) merged.reason = reason;
  }

  const systemMessage = joinLabelled(systemMessages);

  if (systemMessage !== undefined) merged.systemMessage = systemMessage;

  if (stop !== undefined) {
    merged.continue = false;
    if (stop.stopReason !== undefined) merged.stopReason = stop.stopReason;
  }

  if (suppressOutput) merged.suppressOutput = true;

  return { output: Object.keys(merged).length === 0 ? undefined : merged, anomalies };
}
