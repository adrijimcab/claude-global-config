/**
 * Reads the reviewer model's answer into a review, or says why it is not one. The model is untrusted: the
 * answer must be one JSON object with `verdict` "pass" or "fail", a `summary`, and `findings`, each with a
 * `file` that is among the files the unit changed, an integer `line` of 1 or more, a `standard` that is one
 * of the standard's numbered items and a non-empty `why`. A fail needs at least one finding and a pass none.
 * Anything else THROWS, so an answer that is not a review can never be recorded, and never reads as a pass.
 *
 * @es Lee la respuesta del modelo revisor como una revisión, o dice por qué no lo es. El modelo no es de
 * fiar: la respuesta debe ser un objeto JSON con `verdict` "pass" o "fail", un `summary` y `findings`, cada uno
 * con un `file` entre los que cambió la unidad, un `line` entero de 1 o más, un `standard` que sea un ítem
 * numerado del estándar y un `why` no vacío. Un fail necesita al menos un hallazgo y un pass ninguno. Todo lo
 * demás LANZA, así que una respuesta que no es una revisión jamás se registra ni se lee como un pase.
 */

import { objectIn } from '../judge-gate/verdict.mjs';

const unreadable = (en, es) => new Error(`The reviewer answer is not a review: ${en}. @es La respuesta del revisor no es una revisión: ${es}.`);

/** One finding, validated. @es Un hallazgo, validado. */
function findingOf(raw, { files, items }) {
  if (raw === null || typeof raw !== 'object') throw unreadable('a finding is not an object', 'un hallazgo no es un objeto');
  if (!files.includes(raw.file)) throw unreadable(`the finding names ${JSON.stringify(raw.file)}, which the unit did not change`, `el hallazgo nombra ${JSON.stringify(raw.file)}, que la unidad no cambió`);
  if (!Number.isInteger(raw.line) || raw.line < 1) throw unreadable('a finding has no line of 1 or more', 'un hallazgo no tiene línea de 1 o más');
  if (!items.includes(raw.standard)) throw unreadable(`the finding cites standard item ${JSON.stringify(raw.standard)}, which does not exist`, `el hallazgo cita el ítem ${JSON.stringify(raw.standard)} del estándar, que no existe`);
  if (typeof raw.why !== 'string' || raw.why.trim() === '') throw unreadable('a finding has no why', 'un hallazgo no tiene porqué');

  return { file: raw.file, line: raw.line, standard: raw.standard, why: raw.why.trim() };
}

/**
 * @param {string} answer
 * @param {{ files: string[], items: number[] }} context
 * @returns {{ verdict: 'pass' | 'fail', summary: string, findings: Array<{ file: string, line: number, standard: number, why: string }> }}
 * @es Devuelve la revisión; lanza un error bilingüe si la respuesta no lo es.
 */
export function readReview(answer, context) {
  const raw = objectIn(answer);

  if (raw === undefined) throw unreadable('it holds no JSON object', 'no trae un objeto JSON');
  if (raw.verdict !== 'pass' && raw.verdict !== 'fail') throw unreadable('verdict is neither pass nor fail', 'verdict no es pass ni fail');
  if (!Array.isArray(raw.findings)) throw unreadable('findings is not a list', 'findings no es una lista');
  const findings = raw.findings.map((finding) => findingOf(finding, context));

  if (raw.verdict === 'fail' && findings.length === 0) throw unreadable('a fail without findings', 'un fail sin hallazgos');
  if (raw.verdict === 'pass' && findings.length > 0) throw unreadable('a pass that lists findings', 'un pass que lista hallazgos');

  return { verdict: raw.verdict, summary: typeof raw.summary === 'string' ? raw.summary.trim() : '', findings };
}
