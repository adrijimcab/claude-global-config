/**
 * Los bloques de TEXTO visibles que el asistente escribió en el turno actual, leídos del transcript.
 *
 * Por qué todo el turno y no solo el mensaje final: el `last_assistant_message` del payload de Stop es
 * la última respuesta, pero una línea de progreso en inglés entre dos herramientas («Running the real
 * sync now.») también le llega al dueño, y fue una de las formas medidas del fallo.
 *
 * Forma del transcript, MEDIDA sobre el JSONL real de la sesión c45d798b (187 MB, 2026-09-28): cada
 * línea es un objeto con `type`. Los mensajes del asistente son `type: 'assistant'` con
 * `message.content` como arreglo de bloques (`text`, `thinking`, `tool_use`); solo `text` es visible.
 * Los resultados de herramienta son `type: 'user'` con bloques `tool_result` y NO cortan el turno. Todo
 * otro `type: 'user'` (mensaje del dueño, `<task-notification>`, feedback de un hook de Stop, aviso de
 * continuación) SÍ abre un turno nuevo: lo que el asistente escribe después va dirigido al dueño.
 * `isSidechain: true` es tráfico de subagentes y se ignora.
 */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

/** Ventana inicial de lectura desde el final y su techo: el transcript real pesa 187 MB. */
const INITIAL_WINDOW = 1 << 20;
const MAX_WINDOW = 64 << 20;

const isToolResultEntry = (content) => Array.isArray(content) && content.some((block) => block?.type === 'tool_result');

/** Un `type: 'user'` que no es resultado de herramienta: abre un turno. */
export function opensTurn(entry) {
  return entry?.type === 'user' && entry.isSidechain !== true && !isToolResultEntry(entry.message?.content);
}

/**
 * Texto que el harness escribe en nombre del asistente sin que lo haya redactado el modelo. MEDIDO en
 * el transcript real: «API Error: 529 Overloaded…» llega como `type: 'assistant'` con
 * `message.model: '<synthetic>'` e `isApiErrorMessage: true`. No es una respuesta del orquestador y
 * reescribirla es imposible, así que no se juzga.
 */
const isSynthetic = (entry) => entry.message?.model === '<synthetic>' || entry.isApiErrorMessage === true;

/** Los bloques `text` redactados por el modelo fuera de subagentes; cualquier otra entrada, ninguno. */
export function visibleTextsOf(entry) {
  if (entry?.type !== 'assistant' || entry.isSidechain === true || isSynthetic(entry)) return [];

  const content = entry.message?.content;

  if (!Array.isArray(content)) return [];

  return content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text);
}

/**
 * Pura: los textos del último turno a partir de las líneas JSONL, en orden. `complete` indica si se
 * llegó al comienzo del turno; si no, el turno empieza antes de la ventana leída.
 * `unparsable` cuenta líneas que no son JSON (una línea cortada al borde de la ventana, o basura).
 */
export function turnTextsFromLines(lines) {
  const texts = [];
  let unparsable = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (line.trim().length === 0) continue;

    let entry;

    try {
      entry = JSON.parse(line);
    } catch {
      unparsable += 1;
      continue;
    }

    if (opensTurn(entry)) return { texts: texts.reverse(), complete: true, unparsable };

    texts.push(...visibleTextsOf(entry).reverse());
  }

  return { texts: texts.reverse(), complete: false, unparsable };
}

/**
 * Las últimas `bytes` del archivo como líneas completas. Cuando la ventana no empieza en el byte 0 se
 * lee también el byte ANTERIOR y se descarta el primer fragmento: si ese byte era un salto de línea el
 * fragmento es vacío y no se pierde nada; si no, es la línea cortada. El corte se hace en BYTES y
 * recién después se decodifica (lección medida en engram-persistence: cortar un string decodificado
 * con un offset en bytes cae fuera de lugar con texto multibyte).
 */
function tailLines(descriptor, size, bytes) {
  const start = Math.max(0, size - bytes);
  const from = start === 0 ? 0 : start - 1;
  const buffer = Buffer.alloc(size - from);

  readSync(descriptor, buffer, 0, buffer.length, from);

  const lines = buffer.toString('utf8').split('\n');

  return start === 0 ? lines : lines.slice(1);
}

/**
 * Los textos del turno actual en `transcriptPath`. Lee desde el final con una ventana que se duplica
 * hasta encontrar el comienzo del turno o el techo; así un Stop nunca lee 187 MB enteros.
 */
export function readTurnTexts(transcriptPath) {
  const descriptor = openSync(transcriptPath, 'r');

  try {
    const { size } = fstatSync(descriptor);
    let window = INITIAL_WINDOW;

    for (;;) {
      const result = turnTextsFromLines(tailLines(descriptor, size, window));

      if (result.complete || window >= size || window >= MAX_WINDOW) return result;

      window *= 2;
    }
  } finally {
    closeSync(descriptor);
  }
}
