/**
 * The shortening of a PROMOTED lesson's ledger line to its minimal stub, without losing the line. The stub
 * is built by the line grammar (`minimalStub`), the WHOLE original is archived to the evidence store with a
 * note of how the promotion closed, the evidence is RE-READ from disk, and only then does the conservation
 * proof (`conservation.mjs`, given the promotion date and mechanism as its explicit `promotion` input)
 * decide. The caller writes the ledger only on `ok`, so any failure leaves the ledger byte-identical; the
 * archive is append-only and may keep the block it wrote, which loses nothing.
 *
 * @es El acortamiento de la línea de una lección PROMOVIDA a su muñón mínimo, sin perder la línea. El muñón
 * lo construye la gramática de línea (`minimalStub`), el ORIGINAL ENTERO se archiva en el almacén de
 * evidencia con una nota de cómo cerró la promoción, la evidencia se RELEE de disco y solo entonces decide
 * la prueba de conservación (con la fecha y el mecanismo de la promoción como entrada explícita
 * `promotion`). El llamante escribe el ledger solo con `ok`, así que cualquier fallo deja el ledger idéntico
 * byte a byte; el archivo solo se añade y puede conservar el bloque escrito, lo que no pierde nada.
 */

import { closureClause } from './closure.mjs';
import { proveConservation } from './conservation.mjs';
import { appendEvidence, readEvidence } from './evidence.mjs';
import { joinBilingual, minimalStub, readMarker, refuse } from './ledger-line.mjs';

/** What touches the disk, replaceable so a proof can make it lie. @es Lo que toca el disco, sustituible para que una prueba lo haga mentir. */
const REAL_IO = { appendEvidence, readEvidence };

/** A refusal whose reasons are joined after the statement that nothing was promoted. @es Una negativa cuyos motivos siguen a la frase de que nada se promovió. */
const notPromoted = (reasons) => ({ ok: false, line: '', problem: joinBilingual(['the lesson was not promoted: the ledger line is unchanged. @es la lección no se promovió: la línea del ledger no cambió.', ...reasons]) });

/**
 * @param input `{ ledgerFile, original, date, closure, where, io }` — `original` is the ledger line being
 *   promoted, `closure` what `readClosure` returned (mechanism or no-mechanism), `where` the text saying where
 *   the rule landed, `io` optional replacements for the evidence store.
 * @returns `{ ok: true, line }` with the stub to write, or `{ ok: false, problem }` (bilingual).
 * @es `original` es la línea del ledger que se promueve, `closure` lo que devolvió `readClosure`, `where` el texto de dónde aterrizó la regla.
 */
export function promotedStub({ ledgerFile, original, date, closure, where, io }) {
  const store = { ...REAL_IO, ...io };
  const marker = readMarker(original);
  const mechanism = closure.kind === 'mechanism' ? closure.path : undefined;
  const built = marker === undefined ? refuse('the line carries no marker.', 'la línea no lleva marcador.') : minimalStub({ date, mechanism, marker: original.slice(marker.open, marker.close) });

  if (!built.ok) return notPromoted([built.problem]);

  const archived = store.appendEvidence({ ledgerFile, key: marker.key, line: original, date, kind: 'promoted', note: `Promoted ${date} to ${where}; ${closureClause(closure)}` });

  if (!archived.ok) return notPromoted([archived.problem]);

  const proof = proveConservation({ original, shortened: built.line, evidence: store.readEvidence(ledgerFile, marker.key), promotion: { date, mechanism } });

  return proof.ok ? { ok: true, line: built.line } : notPromoted(proof.deficits);
}
