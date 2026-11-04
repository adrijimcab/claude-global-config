/**
 * Owns the question "would this landing leave the live ledger with less than it holds now?", as pure
 * functions over text: which lesson keys a ledger text carries with their counts, and which keys of the live
 * ledger the landed tree lacks or holds at a lower count. Nothing here touches a file or git; the adapter
 * that reads the two sides is `live-ledger.mjs`. The marker is parsed by `readMarker` of
 * `../failure-capture/ledger-line.mjs`, the one parser every ledger tool shares.
 *
 * Closes the incident `live-ledger-lines-dropped-by-landing`: a landing fast-forwards the main checkout to a
 * tree whose ledger lacked lines that existed only in the main checkout's working copy, and four lessons and
 * two counts vanished from the live ledger.
 *
 * @es Es dueño de la pregunta «¿este aterrizaje dejaría el ledger vivo con menos de lo que tiene ahora?», como
 * funciones puras sobre texto: qué claves de lección lleva un texto de ledger con sus recuentos, y qué claves
 * del ledger vivo faltan en el árbol aterrizado o están con un recuento menor. Nada aquí toca ficheros ni git;
 * el adaptador que lee ambos lados es `live-ledger.mjs`. El marcador lo lee `readMarker` de
 * `../failure-capture/ledger-line.mjs`, el único lector que comparten las herramientas de ledger. Cierra el
 * incidente `live-ledger-lines-dropped-by-landing`.
 */

import { readMarker } from '../failure-capture/ledger-line.mjs';

/**
 * Every key the ledger texts carry, with the highest count written for it over all of them (a key lives in
 * one ledger line, but a lesson moved between ledger files must not lose its count).
 * @es Cada clave que llevan los textos de ledger, con el mayor recuento escrito para ella entre todos (una
 * clave vive en una línea de ledger, pero una lección movida entre ficheros de ledger no debe perder su recuento).
 * @param {(string | undefined)[]} texts the ledger files' texts, undefined for an absent file
 * @returns {Map<string, number>}
 */
export function keysOfLedgerTexts(texts) {
  const keys = new Map();
  for (const text of texts) {
    for (const line of (text ?? '').split('\n')) {
      const marker = readMarker(line);
      if (marker !== undefined && marker.count > (keys.get(marker.key) ?? 0)) keys.set(marker.key, marker.count);
    }
  }
  return keys;
}

/**
 * The keys of `live` the `tree` lacks (`tree` undefined) or holds at a lower count. Equal or higher counts and
 * keys only the tree has are not findings.
 * @es Las claves de `live` que `tree` no tiene (`tree` indefinido) o tiene con un recuento menor. Recuentos
 * iguales o mayores y claves que solo tiene el árbol no son hallazgos.
 * @param {Map<string, number>} live
 * @param {Map<string, number>} tree
 * @returns {{ key: string, live: number, tree: number | undefined }[]} in the order of the live ledger
 */
export function ledgerShortfalls(live, tree) {
  const findings = [];
  for (const [key, liveCount] of live) {
    const treeCount = tree.get(key);
    if (treeCount === undefined || treeCount < liveCount) findings.push({ key, live: liveCount, tree: treeCount });
  }
  return findings;
}
