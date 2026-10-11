/**
 * Pending-work markers — the LOCATION half of the backlog-guard mechanism.
 *
 * WHAT THIS IS AND IS NOT, same discipline as `failure-capture/markers.mjs`. These strings LOCATE a
 * candidate "something is left pending" announcement in a final assistant message. They do NOT decide
 * that the finding is real or worth recording — no command hook can judge that. A hit opens an
 * OBLIGATION to save it to the master backlog or dismiss it with a stated reason, never a verdict.
 * `grep localiza, NO dictamina` (lessons ledger 2026-08-03).
 *
 * WHERE THESE CAME FROM. The owner directive names the candidate roots directly: "encolo/encolar,
 * pendiente, queda por, falta, TODO, backlog, hallazgo, sin lanzar" (Spanish) plus their obvious
 * English counterparts. Each Spanish root was checked against real occurrences in this project's own
 * session transcripts (`~/.claude/projects/<slug>/*.jsonl`) before being kept as a literal phrase here —
 * not invented, and not the owner's bare root where that root is too broad to use standalone (see the
 * bare-word exclusions below).
 *
 * THE BARE-WORD EXCLUSION, same shape `failure-capture/markers.mjs` already documents for its own set.
 * `pendiente` and `todo` are both extremely common ordinary Spanish words ("todo el árbol", "pendiente
 * de..." as a section label, "todo bien") that would fire on nearly every long report. Rather than
 * drop the owner's requested roots outright, each is kept as a MORE SPECIFIC compound phrase actually
 * observed announcing pending work in this project's transcripts ("queda pendiente", "sigue pendiente",
 * "lo dejamos como pendiente", "pending tasks", "still pending", "todo:" as a list/comment marker with
 * its colon) rather than the bare root alone. This mechanism's own bound (a dismiss path with a
 * recorded reason) is what tolerates the residual false positives a broader literal set still produces
 * — the owner directive explicitly designs for that, it is not a defect to eliminate here.
 *
 * NO REGEX (owner mandate M5): `toLowerCase()` + `includes()` on plain literals, same as
 * `failure-capture/markers.mjs` and for the identical stated reason — a non-matching regex skips
 * silently, which is the exact failure class this mechanism exists to close.
 *
 * @es Marcadores de trabajo pendiente — la mitad de LOCALIZACIÓN del mecanismo backlog-guard. Localizan
 * un candidato a «queda algo pendiente» en el mensaje final; NO dictaminan que el hallazgo sea real. Un
 * acierto abre una OBLIGACIÓN de guardarlo en el backlog maestro o descartarlo con motivo, nunca un
 * veredicto. Las raíces vienen literalmente de la directiva del dueño, contrastadas contra transcripts
 * reales de este proyecto; las raíces sueltas demasiado comunes (`pendiente`, `todo`) se sustituyen por
 * frases compuestas observadas de verdad, nunca por la raíz sola. SIN REGEX (mandato M5).
 */

/**
 * Phrases that mark a candidate "something is left pending" announcement. Lowercase only — the caller
 * lowercases the message before testing.
 * @es Frases que marcan un candidato a anuncio de «queda algo pendiente». Solo minúsculas.
 */
export const PENDING_MARKERS = Object.freeze([
  // --- ANNOUNCING phrases only (owner order 2026-10-11): first-person intent to queue or record, never the
  // --- bare nouns "backlog" / "hallazgo" (they NAME an item) nor the infinitive "encolar" (it mentions the rule).
  // --- Solo frases que ANUNCIAN: intención en primera persona de encolar o registrar, nunca los sustantivos
  // --- sueltos «backlog» / «hallazgo» (nombran un ítem) ni el infinitivo «encolar» (menciona la regla).
  'encolo',
  'encolé',
  'queda por',
  'quedan por',
  'sin lanzar',
  'lo anoto',
  'lo apunto',
  'lo sumo',
  'lo agrego',
  'va al backlog',
  'van al backlog',
  'sumo al backlog',
  'agrego al backlog',
  'paso al backlog',
  'to the backlog',
  'hallazgo nuevo',
  'nuevo hallazgo',
  'new finding',

  // --- "pendiente" kept as compound phrases, never the bare word, and never "sigue/siguen" (continues = not new)
  // --- "pendiente" solo en frases compuestas, nunca la palabra sola ni «sigue/siguen» (continúa = no es nuevo)
  'lo dejamos como pendiente',
  'lo dejo como pendiente',
  'pendiente de integrar',
  'pendientes de integrar',
  'pendiente del dueño',
  'pendiente del propietario',
  'pendiente del owner',

  // --- "falta" kept as compound phrases for the same reason ("falta" alone is a common verb form)
  // --- "falta" en frases compuestas, por el mismo motivo (sola es una forma verbal muy común)
  'falta lanzar',
  'falta integrar',
  'falta hacer',
  'falta resolver',
  'falta commitear',
  'falta un commit',

  // --- English equivalents of the roots above, confirmed against this project's own transcripts
  // --- Equivalentes en inglés de las raíces de arriba, confirmados contra transcripts reales
  'queued commit',
  'pending tasks',
  'pending task:',
  'left pending',
  'worth flagging',
  'worth your attention',
  'flagging this for',
  'flag this for the owner',
  'out of scope for this task',
  'left for others',
  'left uncommitted',
  'needs the owner',
  'needs a decision',
  'owner decision pending',
  'not yet recorded',
  'not yet saved',
]);

/**
 * Returns the first pending-work marker present in `message`, or `undefined`. Pure, no regex.
 * @es Devuelve el primer marcador de trabajo pendiente en `message`, o `undefined`. Pura, sin regex.
 */
export function findPendingMarker(message) {
  if (typeof message !== 'string' || message.length === 0) return undefined;

  const haystack = message.toLowerCase();

  // The list/comment shape "TODO:" is case-sensitive: lowercase "todo:" is the Spanish word "everything".
  // @es La forma de lista "TODO:" distingue mayúsculas: «todo:» en minúscula es la palabra española.
  return message.includes('TODO:') ? 'TODO:' : PENDING_MARKERS.find((marker) => haystack.includes(marker));
}
