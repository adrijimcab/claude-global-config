/**
 * The decisions the dispatcher journals: every guard output that BLOCKS becomes one `decision` record in the
 * v2 journal of that guard's mechanism (`hook-state/journal.mjs`), which is what the false-block rate
 * (`guard-precision/`) counts and what a human later labels or dismisses. A guard output blocks when it
 * carries `permissionDecision: deny`, a top-level `decision: block`, or `continue: false`; an `ask`, an
 * `allow`, context or a note do not. The dispatcher is the one place that sees every guard's output, and it
 * reads it BEFORE the merge, when the guard is still known.
 *
 * The mechanism is the folder of the guard file (`type-assertion-guard/guard.mjs` -> `type-assertion-guard`),
 * the same name its state directory and `dismiss.mjs --mechanism` use, so a dismissal joins its decision. The
 * record never holds the command: `inputDigest` is the sha256 of the tool input (of the whole payload when
 * there is none), and the reason the guard gave is cut to `REASON_LIMIT`. `blockId` is a fresh time-sortable
 * id per block, the id `dismiss.mjs --block` and `label.mjs` take.
 *
 * Journaling is FAIL OPEN: a write that fails never throws and never changes what the hook says; it comes
 * back as a failure line for the caller to report in the dispatch journal.
 *
 * @es Las decisiones que el dispatcher registra: cada salida de guardia que BLOQUEA pasa a ser un registro
 * `decision` en el journal v2 del mecanismo de esa guardia (`hook-state/journal.mjs`), que es lo que cuenta la
 * tasa de falsos bloqueos (`guard-precision/`) y lo que una persona etiqueta o descarta después. Una salida
 * bloquea cuando lleva `permissionDecision: deny`, un `decision: block` de nivel superior o `continue: false`;
 * un `ask`, un `allow`, contexto o una nota no. El dispatcher es el único lugar que ve la salida de cada
 * guardia, y la lee ANTES de fusionar, cuando aún se sabe de qué guardia es.
 *
 * El mecanismo es la carpeta del fichero de la guardia, el mismo nombre que usan su directorio de estado y
 * `dismiss.mjs --mechanism`, así un descarte se une a su decisión. El registro nunca guarda el comando:
 * `inputDigest` es el sha256 de la entrada de la herramienta (del payload entero si no hay), y el motivo que
 * dio la guardia se corta a `REASON_LIMIT`. `blockId` es un id nuevo ordenable por tiempo por bloqueo, el que
 * toman `dismiss.mjs --block` y `label.mjs`.
 *
 * Registrar FALLA ABIERTO: una escritura que falla nunca lanza ni cambia lo que dice el hook; vuelve como una
 * línea de fallo para que quien llama la informe en el diario del dispatcher.
 */

import { tryParsePayload } from '../hook-io/hook-io.mjs';
import { appendRecord, digestInput, newId } from '../hook-state/journal.mjs';

/** The longest reason journaled, in characters. @es El motivo más largo que se registra, en caracteres. */
export const REASON_LIMIT = 300;

/** `text` cut to `REASON_LIMIT`, ending in an ellipsis when it was cut. @es `text` cortado a `REASON_LIMIT`, con puntos suspensivos si se cortó. */
const truncate = (text) => (text.length <= REASON_LIMIT ? text : `${text.slice(0, REASON_LIMIT - 1)}…`);

/**
 * `{ reason }` when `output` blocks (`reason` is undefined when the guard gave none), `undefined` when it
 * does not. The reason is the first non-empty one among the deny reason, the block reason and the stop reason.
 * @es `{ reason }` si `output` bloquea (`reason` es undefined si la guardia no dio ninguno), `undefined` si no. El motivo es el primero no vacío entre el del deny, el del block y el de la parada.
 */
export function blockOf(output) {
  const denied = output?.hookSpecificOutput?.permissionDecision === 'deny';
  const blocked = output?.decision === 'block';
  const stopped = output?.continue === false;

  if (!denied && !blocked && !stopped) return undefined;

  const reason = [denied && output.hookSpecificOutput.permissionDecisionReason, blocked && output.reason, stopped && output.stopReason].find((text) => typeof text === 'string' && text !== '');

  return { reason };
}

/**
 * The blocks of one dispatch: one per guard output that blocks, in manifest order, with the facts of the
 * payload. `results` is `[{ mechanism, output }]`.
 * @es Los bloqueos de un despacho: uno por cada salida de guardia que bloquea, en el orden del manifiesto, con los datos del payload. `results` es `[{ mechanism, output }]`.
 */
export function describeBlocks({ event, raw, results }) {
  const payload = tryParsePayload(raw);
  const toolUseId = typeof payload?.tool_use_id === 'string' ? payload.tool_use_id : null;
  const inputDigest = digestInput(payload?.tool_input ?? raw);

  return results.flatMap(({ mechanism, output }) => {
    const block = blockOf(output);

    return block === undefined ? [] : [{ mechanism, event, toolUseId, inputDigest, reason: block.reason === undefined ? undefined : truncate(block.reason) }];
  });
}

/**
 * Appends one `decision` per block to the journal of its mechanism and returns the failures as
 * `<mechanism>: <message>` lines; it never throws, and a block that fails does not stop the next.
 * @es Añade un `decision` por bloqueo al journal de su mecanismo y devuelve los fallos como líneas `<mecanismo>: <mensaje>`; nunca lanza, y un bloqueo que falla no detiene al siguiente.
 * @param options.append Replaces `appendRecord` (a test seam). @es Sustituye a `appendRecord` (punto de prueba).
 * @param options.newBlockId Replaces the id generator (a test seam). @es Sustituye al generador de ids (punto de prueba).
 */
export function recordBlocks(blocks, { append = appendRecord, newBlockId = newId } = {}) {
  const failures = [];

  for (const { mechanism, ...fields } of blocks) {
    try {
      append(mechanism, { kind: 'decision', blockId: newBlockId(), ...fields });
    } catch (error) {
      failures.push(`${mechanism}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return failures;
}
