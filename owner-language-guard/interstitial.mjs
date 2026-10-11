/**
 * The assistant text written since the last tool result: the interstitial lines that reach the owner
 * just before a tool call («Now the spec revision.»). Own concern: WHICH text a PreToolUse judges; the
 * language verdict stays in `decide.mjs`.
 *
 * Shape (MEASURED by the orchestrator, 2026-10-11): the text written before a tool call is already in
 * `transcript_path` when that call's PreToolUse fires. Any non-sidechain `type: 'user'` entry (a tool
 * result, the owner's prompt, a notification) closes the previous step, so what follows it is what the
 * owner just read. Only the TAIL of the transcript is read, with a window that doubles up to a ceiling.
 *
 * @es El texto del asistente escrito desde el último resultado de herramienta: las líneas intermedias que
 * le llegan al dueño justo antes de una llamada. Lee solo la COLA del transcript, con una ventana que se
 * duplica hasta un techo.
 */

import { closeSync, fstatSync, openSync } from 'node:fs';

import { tailLines, visibleTextsOf } from './turn.mjs';

const INITIAL_WINDOW = 256 << 10;
const MAX_WINDOW = 8 << 20;

/** Pure: texts after the last user entry in `lines`; `complete` says that entry was reached. @es Pura: los textos tras la última entrada de usuario. */
export function interstitialFromLines(lines) {
  const texts = [];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let entry;

    try {
      entry = JSON.parse(lines[index]);
    } catch {
      continue;
    }

    if (entry?.type === 'user' && entry.isSidechain !== true) return { texts: texts.reverse(), complete: true };

    texts.push(...visibleTextsOf(entry).reverse());
  }

  return { texts: texts.reverse(), complete: false };
}

/**
 * The interstitial texts of `transcriptPath`. When the ceiling is hit before the previous step is found
 * the answer is empty: texts of unknown age are never judged. @es Si se llega al techo sin hallar el paso
 * anterior, la respuesta es vacía: un texto de antigüedad desconocida no se juzga.
 */
export function readInterstitialTexts(transcriptPath) {
  const descriptor = openSync(transcriptPath, 'r');

  try {
    const { size } = fstatSync(descriptor);
    let window = INITIAL_WINDOW;

    for (;;) {
      const result = interstitialFromLines(tailLines(descriptor, size, window));

      if (result.complete || window >= size) return result.texts;
      if (window >= MAX_WINDOW) return [];

      window *= 2;
    }
  } finally {
    closeSync(descriptor);
  }
}
