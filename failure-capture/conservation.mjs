/**
 * The proof that a ledger line may be shortened: the WHOLE original must be a whole line of the evidence
 * file as re-read from disk, and the shortened line must invent nothing — it may hold only slices of the
 * original plus the builder's own fixed labels (`ledger-line.mjs`). Pure: strings in, verdict out; the
 * caller does the archiving and the re-reading, so the proof cannot be satisfied by the write it checks.
 *
 * WHY WHOLE-LINE CONTAINMENT AND NOT A CHARACTER COUNT. A prefix, a copy with a lost tilde or a copy with
 * another counter all contain most of the original's characters; only "the exact original is a line of the
 * file" refuses all three, and it needs no reasoning about duplicates. The characters that are missing are
 * still NAMED, so a refusal says what was lost.
 *
 * @es La prueba de que una línea del ledger puede acortarse: el ORIGINAL entero debe ser una línea entera
 * del fichero de evidencia releído de disco, y la línea acortada no debe inventar nada: solo trozos del
 * original y las etiquetas fijas del constructor. Pura: el llamante archiva y relee, así la prueba no
 * puede satisfacerse con la escritura que comprueba. Contención de línea entera y no recuento de
 * caracteres: un prefijo, una tilde perdida o otro contador contienen casi todo el original. Los
 * caracteres que faltan se NOMBRAN.
 */

import { evidenceKeyOf, minimalStub, parseEntry, parseStub, refuse, splitRule, tieredLine } from './ledger-line.mjs';

/** Whether `line` is a whole line of `text` — the first and the last one included. @es Si `line` es una línea entera de `text`, la primera y la última incluidas. */
export function holdsWholeLine(text, line) {
  return line.length > 0 && !line.includes('\n') && `\n${text}\n`.includes(`\n${line}\n`);
}

/** How many leading characters `a` and `b` share. @es Cuántos caracteres iniciales comparten `a` y `b`. */
function sharedPrefix(a, b) {
  let at = 0;

  while (at < a.length && a[at] === b[at]) at += 1;

  return at;
}

/** What is missing from the evidence for it to hold `original`, named. @es Qué falta en la evidencia para contener `original`, con nombre. */
function archiveDeficits(original, evidence) {
  if (evidence === undefined) return ['the evidence file is absent or unreadable. @es el fichero de evidencia no existe o no se puede leer.'];
  if (holdsWholeLine(evidence, original)) return [];

  const closest = evidence.split('\n').reduce((best, line) => Math.max(best, sharedPrefix(line, original)), 0);
  const lost = [...new Set(original)].filter((character) => !evidence.includes(character));
  const named = lost.map((character) => `"${character}" (U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`).join(', ');

  return [
    `the original line is not a whole line of the evidence file: its closest line agrees with the first ${String(closest)} of ${String(original.length)} characters. @es la línea original no es una línea entera de la evidencia: la más cercana coincide con los primeros ${String(closest)} de ${String(original.length)} caracteres.`,
    ...(lost.length === 0 ? [] : [`characters of the original found nowhere in the evidence: ${named}. @es caracteres del original que no están en ninguna parte de la evidencia: ${named}.`]),
  ];
}

/** The one line the original can shorten to, given the shape and the key the shortened line chose. @es La única línea a la que puede acortarse el original, dada la forma y la clave que eligió la acortada. */
function expectedShortening(original, shortened) {
  const before = parseEntry(original);

  if (!before.ok) return refuse(`the original is not readable: ${before.problem}`, 'el original no se puede leer.');

  const stub = parseStub(shortened);

  if (stub !== undefined) {
    if (stub.mechanism !== undefined && !original.includes(stub.mechanism)) return refuse('the stub names a mechanism the original never held.', 'el muñón nombra un mecanismo que el original nunca tuvo.');

    return minimalStub({ date: before.date, mechanism: stub.mechanism, marker: before.marker });
  }

  const kept = splitRule(before.body);
  const after = parseEntry(shortened);
  const pointer = after.ok ? splitRule(after.body) : after;

  if (!kept.ok) return kept;
  if (!pointer.ok) return pointer;

  const key = evidenceKeyOf(pointer.rule);

  if (key === undefined) return refuse('the shortened line carries no evidence pointer.', 'la línea acortada no lleva puntero a la evidencia.');

  return tieredLine({ scope: before.scope, date: before.date, tally: kept.tally, rule: kept.rule, key, marker: before.marker });
}

/** Whether the shortened line is exactly what the original's own slices and the fixed labels produce. @es Si la línea acortada es exactamente lo que producen los trozos del original y las etiquetas fijas. */
function inventionDeficits(original, shortened) {
  const expected = expectedShortening(original, shortened);

  if (!expected.ok) return [expected.problem];

  return expected.line === shortened ? [] : ['the shortened line holds text the original does not, or alters some of it. @es la línea acortada tiene texto que el original no tiene, o altera parte de él.'];
}

/**
 * @param input `{ original, shortened, evidence }` — `evidence` is the file's text re-read from disk, or
 *   `undefined` when it is absent or unreadable.
 * @returns `{ ok: true }` or `{ ok: false, deficits }`, each deficit a bilingual sentence naming what is lost.
 * @es `evidence` es el texto del fichero releído de disco, o `undefined` si falta o no se puede leer.
 */
export function proveConservation({ original, shortened, evidence }) {
  const deficits = [...archiveDeficits(original, evidence), ...inventionDeficits(original, shortened)];

  return deficits.length === 0 ? { ok: true } : { ok: false, deficits };
}
