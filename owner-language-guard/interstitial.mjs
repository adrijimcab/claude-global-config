/**
 * The assistant text written since the last tool result: the interstitial lines that reach the owner
 * just before a tool call («Now the spec revision.»). Own concern: WHICH text a PreToolUse judges; the
 * language verdict stays in `decide.mjs`.
 *
 * Shape (MEASURED, 2026-10-11 and 2026-10-12, Claude Code 2.1.296): any non-sidechain `type: 'user'` entry (a
 * tool result, the owner's prompt, a notification) closes the previous step, so what follows it is what the
 * owner just read. The transcript is written ASYNCHRONOUSLY: when PreToolUse fires, the text record and the
 * `tool_use` record of THAT call are frequently not on disk yet (3 of 4 calls in the live probe,
 * `fixtures/pretool-lag-probe.jsonl`), and both land within about a second. So the reader anchors on the
 * payload's `tool_use_id`: it waits, bounded, until the record carrying that id is on disk (the text of a
 * response is always written BEFORE its tool_use record) and judges the texts between the previous step and
 * that record. Without the id, or when it never lands, it judges what is on disk, as before. Only the TAIL of
 * the transcript is read, with a window that doubles up to a ceiling.
 *
 * @es El texto del asistente escrito desde el último resultado de herramienta: las líneas intermedias que le
 * llegan al dueño justo antes de una llamada. El transcript se escribe de forma ASÍNCRONA: al disparar
 * PreToolUse, el texto y el registro `tool_use` de ESA llamada suelen no estar aún en disco (3 de 4 en la
 * sonda en vivo) y llegan en cerca de un segundo. Por eso el lector se ancla en el `tool_use_id` del payload:
 * espera, con tope, a que el registro con ese id exista (el texto de una respuesta se escribe SIEMPRE antes
 * que su tool_use) y juzga los textos entre el paso anterior y ese registro. Sin id, o si nunca llega, juzga
 * lo que hay en disco, como antes. Lee solo la COLA del transcript, con una ventana que se duplica hasta un techo.
 */

import { closeSync, fstatSync, openSync } from 'node:fs';

import { tailLines, visibleTextsOf } from './turn.mjs';

const INITIAL_WINDOW = 256 << 10;
const MAX_WINDOW = 8 << 20;

/** How long the anchor record may take to land, and how often it is looked for. @es Cuánto puede tardar el registro ancla y cada cuánto se busca. */
export const ANCHOR_WAIT = { timeoutMs: 3000, pollMs: 25 };

/** Blocks the thread for `ms` without spinning (the hook is a one-shot process). @es Bloquea el hilo `ms` sin girar en vacío. */
export const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** True when `entry` is an assistant record holding the `tool_use` block `toolUseId`. @es Verdadero si el registro es del asistente y trae ese bloque tool_use. */
const carriesToolUse = (entry, toolUseId) => entry?.type === 'assistant' && Array.isArray(entry.message?.content) && entry.message.content.some((block) => block?.type === 'tool_use' && block.id === toolUseId);

/**
 * Pure: texts after the last user entry in `lines`; `complete` says that entry was reached. With
 * `toolUseId` only the records BEFORE the one carrying that id are read, and `anchored` says it was found.
 * @es Pura: los textos tras la última entrada de usuario. Con `toolUseId` solo se leen los registros ANTERIORES al que lo trae.
 */
export function interstitialFromLines(lines, toolUseId) {
  const texts = [];
  const anchoring = toolUseId !== undefined;
  let anchored = !anchoring;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let entry;

    try {
      entry = JSON.parse(lines[index]);
    } catch {
      continue;
    }

    if (!anchored) {
      anchored = carriesToolUse(entry, toolUseId);
      continue;
    }

    if (entry?.type === 'user' && entry.isSidechain !== true) return { texts: texts.reverse(), complete: true, anchored };

    texts.push(...visibleTextsOf(entry).reverse());
  }

  return { texts: anchored ? texts.reverse() : [], complete: false, anchored };
}

/** One read of the transcript tail, growing the window until the previous step is found. @es Una lectura de la cola, con ventana creciente hasta hallar el paso anterior. */
function scanTail(descriptor, toolUseId) {
  const { size } = fstatSync(descriptor);
  let window = INITIAL_WINDOW;

  for (;;) {
    const result = interstitialFromLines(tailLines(descriptor, size, window), toolUseId);

    if (!result.anchored || result.complete || window >= size) return result;
    if (window >= MAX_WINDOW) return { ...result, texts: [] };

    window *= 2;
  }
}

/**
 * The interstitial texts of `transcriptPath` for the call `toolUseId`. When the ceiling is hit before the
 * previous step is found the answer is empty: texts of unknown age are never judged. When the anchor record
 * does not land within `wait.timeoutMs`, what is on disk is judged unanchored. `wait` is injectable.
 * @es Si se llega al techo sin hallar el paso anterior, la respuesta es vacía. Si el registro ancla no llega
 * a tiempo, se juzga lo que hay en disco sin ancla. `wait` es inyectable.
 */
export function readInterstitialTexts(transcriptPath, toolUseId, wait = ANCHOR_WAIT) {
  const { timeoutMs, pollMs, sleep = sleepSync, now = Date.now } = { ...ANCHOR_WAIT, ...wait };
  const deadline = now() + timeoutMs;

  for (;;) {
    const anchored = scanOnce(transcriptPath, toolUseId);

    if (anchored.anchored) return anchored.texts;
    if (now() >= deadline) return scanOnce(transcriptPath, undefined).texts;

    sleep(pollMs);
  }
}

function scanOnce(transcriptPath, toolUseId) {
  const descriptor = openSync(transcriptPath, 'r');

  try {
    return scanTail(descriptor, toolUseId);
  } finally {
    closeSync(descriptor);
  }
}
