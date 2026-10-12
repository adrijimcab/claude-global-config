/**
 * What a rubric verdict IS: the one place that reads a judge model's answer and says whether it is a pass, a block
 * or a malfunction. A block is valid only when the answer is a JSON object with `ok: false` and a `reason` that
 * starts with the judge's marker (the reason's first word is how `../premise-judge/journal-guard.mjs` finds the
 * block again). Anything else the model says is NOT a verdict, so it can never hold a turn: it is a malfunction,
 * which the gate lets through and records.
 *
 * WHY. Measured 2026-10-12: the voice judge blocked a stop with the reason "insufficient evidence in transcript",
 * which no rubric rule allows. A native `prompt` hook cannot tell a rubric verdict from a model slip; code can.
 *
 * @es Qué ES un veredicto de rúbrica: el único lugar que lee la respuesta del modelo juez y dice si es un pase,
 * un bloqueo o un fallo de funcionamiento. Un bloqueo es válido solo si la respuesta es un objeto JSON con
 * `ok: false` y un `reason` que empieza por la marca del juez. Todo lo demás NO es un veredicto y nunca retiene
 * un turno: es un fallo de funcionamiento, que la compuerta deja pasar y registra. POR QUÉ: medido el
 * 2026-10-12, el juez de voz bloqueó con «insufficient evidence in transcript», que ninguna regla permite.
 */

/** The first JSON object in `text`, fences and prose around it tolerated. @es El primer objeto JSON de `text`. */
function objectIn(text) {
  const match = /\{[\s\S]*\}/.exec(text);

  if (match === null) return undefined;

  try {
    const parsed = JSON.parse(match[0]);

    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads the model's `answer` for the judge whose block reasons start with `marker`.
 * `{ kind: 'pass' }`, `{ kind: 'block', reason }` or `{ kind: 'malfunction', why }`.
 * @es Lee la respuesta `answer` del modelo para el juez cuyos motivos de bloqueo empiezan por `marker`.
 */
export function readVerdict(answer, marker) {
  const verdict = objectIn(typeof answer === 'string' ? answer : '');

  if (verdict === undefined) return { kind: 'malfunction', why: 'the answer holds no JSON object @es la respuesta no trae un objeto JSON' };
  if (verdict.ok === true) return { kind: 'pass' };
  if (verdict.ok !== false) return { kind: 'malfunction', why: 'the field ok is not a boolean @es el campo ok no es booleano' };
  if (typeof verdict.reason !== 'string' || !verdict.reason.trim().startsWith(marker)) {
    return { kind: 'malfunction', why: `ok false without a reason starting with ${marker} @es ok false sin un motivo que empiece por ${marker}` };
  }

  return { kind: 'block', reason: verdict.reason.trim() };
}
