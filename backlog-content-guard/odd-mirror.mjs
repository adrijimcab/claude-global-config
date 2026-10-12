/**
 * Owns ONE question for `backlog-content-guard`: is an engram write to an ODD mirror (topic_key
 * `odd/<feature>/tasks`) faithful to its source file `odd/tasks/<feature>.md`?
 *
 * WHY A MIRROR IS NOT JUDGED BY THE DROP-NOTHING RULE. The ODD protocol defines the mirror as the full
 * current document, rewritten after every task, so text the file dropped is dropped from the mirror too.
 * The drop-nothing rule (`loss.mjs`) was built for hand-kept records and refused four legitimate mirror
 * rewrites, which were then forced into a "SUPERSEDED" line the file does not have. The right yardstick
 * for a mirror is its source: the new content must contain the whole current file text (a locator line
 * before or after it is fine). A partial or summary mirror is refused, naming the file.
 *
 * VERDICTS (`judgeOddMirror`):
 *   key is not an ODD mirror key            -> `{ applies: false }` (the caller keeps today's rule)
 *   file not found / unreadable / empty     -> `{ applies: false }` (today's drop-nothing rule applies)
 *   content contains the whole file text    -> `{ applies: true }` (allow)
 *   content does not contain it             -> `{ applies: true, refusal }` (deny)
 *
 * The file is located by walking up from the call's working directory to the first ancestor holding
 * `odd/tasks/<feature>.md`. The feature name is validated, so it can never traverse out of that folder.
 *
 * @es Responde UNA pregunta para `backlog-content-guard`: ¿una escritura de engram a un espejo ODD
 * (topic_key `odd/<feature>/tasks`) es fiel a su fichero `odd/tasks/<feature>.md`? El espejo es el
 * documento completo actual, así que lo que el fichero quita también lo quita el espejo: la regla de no
 * perder nada (`loss.mjs`) es para registros llevados a mano. Se juzga contra el fichero: el contenido
 * nuevo debe contener el texto íntegro del fichero (una línea localizadora antes o después vale). Un
 * espejo parcial o resumen se rechaza nombrando el fichero. Si el fichero no se encuentra, no se puede
 * leer o está vacío, sigue rigiendo la regla de no perder nada. El fichero se busca subiendo desde el
 * directorio de trabajo; el nombre de la feature se valida para que no pueda salir de esa carpeta.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIRROR_KEY = /^odd\/([^/]+)\/tasks$/i;
const SAFE_FEATURE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The feature name of an ODD mirror key, or `undefined`. @es El nombre de la feature de una clave de espejo ODD, o `undefined`. */
export function oddFeatureOf(topicKey) {
  if (typeof topicKey !== 'string') return undefined;

  const feature = MIRROR_KEY.exec(topicKey)?.[1];

  return feature !== undefined && SAFE_FEATURE.test(feature) && !feature.includes('..') ? feature : undefined;
}

function canonical(text) {
  return text.replaceAll('\r\n', '\n').trim();
}

/**
 * First `odd/tasks/<feature>.md` found walking up from `start`, as `{ file, text }`, else `undefined`.
 * @es Primer `odd/tasks/<feature>.md` subiendo desde `start`, como `{ file, text }`, o `undefined`.
 */
export function readOddSource(feature, start) {
  if (typeof start !== 'string' || start === '') return undefined;

  let directory = path.resolve(start);

  for (;;) {
    const file = path.join(directory, 'odd', 'tasks', `${feature}.md`);

    try {
      const text = canonical(readFileSync(file, 'utf8').replace(/^﻿/, ''));

      if (text !== '') return { file, text };
    } catch {
      /* not here (or unreadable): keep walking up */
    }

    const parent = path.dirname(directory);

    if (parent === directory) return undefined;
    directory = parent;
  }
}

/**
 * The verdict for one write. `readSource(feature, cwd)` is injectable for tests of the pure branch.
 * @es El veredicto de una escritura. `readSource(feature, cwd)` es inyectable.
 */
export function judgeOddMirror(base, topicKey, next, cwd, readSource = readOddSource) {
  const feature = oddFeatureOf(topicKey);

  if (feature === undefined) return { applies: false };

  const source = readSource(feature, cwd);

  if (source === undefined) return { applies: false };
  if (canonical(next).includes(source.text)) return { applies: true };

  return { applies: true, refusal: { ...base, kind: 'odd-mirror-incomplete', file: source.file, dropped: [] } };
}
