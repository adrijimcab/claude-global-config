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
 * PHRASE FORMS, NOT BARE VERBS (2026-10-18, by data, same method as the «corrección» narrowing in
 * `failure-capture/markers.mjs`). `state/dismissals.jsonl` holds 98 dismissals; the ones for the verbs
 * «lo sumo» (5), «lo agrego» (2), «queda por» (5), «falta hacer», «falta integrar» (2) and «pendiente de
 * integrar» were each a phrase that is NOT a new pending item: finished work added to a checkpoint
 * («lo sumo al checkpoint-37»), a conditional offer, a measurement («queda por debajo de los 200 ms»),
 * a negation («no hace falta hacer nada», «nada pendiente de integrar»). So the verbs «sumo / agrego /
 * anoto / apunto» are markers only with their destination («a la lista», «como pendiente», «en el
 * backlog», «para después»); «queda por» needs an infinitive after it; and a marker preceded by a negator
 * or by «lo que» is a description, not an announcement. «lo dejo pendiente», «queda pendiente» and
 * «quedan pendientes» were added: they announce pending work and none of them fired before.
 * @es FORMAS DE FRASE, NO VERBOS SUELTOS (2026-10-18, por datos): los descartes de `lo sumo`, `lo agrego`,
 * `queda por`, `falta hacer`, `falta integrar` y `pendiente de integrar` eran frases que NO son un ítem
 * pendiente nuevo. Por eso los verbos solo son marcador con su destino, `queda por` pide un infinitivo, y
 * un negador o «lo que» delante vuelve el marcador una descripción. Se añadieron `lo dejo pendiente`,
 * `queda pendiente` y `quedan pendientes`, que anuncian trabajo pendiente y antes no disparaban.
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
  // The verbs «anoto / apunto / sumo / agrego» are markers only WITH the destination that makes them a new
  // pending item. Alone they also say «I add finished work to a checkpoint» («lo sumo al checkpoint-37»,
  // 3 dismissals), «a lo sumo» (at most) and «I would add it if you ask» (1 dismissal); see the 2026-10-18 note.
  // @es Los verbos «anoto / apunto / sumo / agrego» son marcador solo CON el destino que los vuelve un ítem
  // @es pendiente nuevo; solos también dicen «sumo trabajo terminado a un checkpoint», «a lo sumo» y una oferta.
  'lo anoto como pendiente',
  'lo anoto en el backlog',
  'lo anoto para después',
  'lo anoto para despues',
  'lo anoto para más adelante',
  'lo anoto para mas adelante',
  'lo apunto como pendiente',
  'lo apunto en el backlog',
  'lo apunto para después',
  'lo apunto para despues',
  'lo apunto para más adelante',
  'lo apunto para mas adelante',
  'lo sumo a la lista',
  'lo sumo a pendientes',
  'lo sumo como pendiente',
  'lo agrego a la lista',
  'lo agrego a pendientes',
  'lo agrego como pendiente',
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
  'lo dejo pendiente',
  'queda pendiente',
  'quedan pendientes',
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
 * Markers that announce work only when an INFINITIVE follows («queda por resolver», «quedan por integrar»).
 * «queda por debajo de 200 ms» is a measurement, not a pending item (2 dismissals).
 * @es Marcadores que anuncian trabajo solo si les sigue un INFINITIVO. «queda por debajo de 200 ms» es una medición.
 */
const INFINITIVE_FRAMES = Object.freeze(['queda por', 'quedan por']);

/** Word endings of a Spanish infinitive. @es Terminaciones de un infinitivo español. */
const INFINITIVE_ENDINGS = Object.freeze(['ar', 'er', 'ir']);

/**
 * What may stand right before a marker to turn it into something that is NOT a new announcement. Negators
 * make it its opposite: «no hace falta hacer», «no hay nada pendiente de integrar», «ya no falta integrar».
 * «lo que» turns it into a description of what exists: «Lo que queda pendiente, sin apuro» is a heading over
 * an item recorded earlier (a labelled live turn). The text before the marker must END with one of these
 * (the haystack is lowercase).
 * @es Lo que puede preceder a un marcador para que NO sea un anuncio nuevo. Los negadores lo vuelven su
 * contrario; «lo que» lo vuelve una descripción de lo ya existente. El texto previo debe TERMINAR en uno de estos.
 */
const VOIDING_PREFIXES = Object.freeze(['no ', 'nada ', 'no hace ', 'no hay ', 'lo que ']);

/**
 * Returns the first pending-work marker present in `message`, or `undefined`. Pure, no regex.
 * @es Devuelve el primer marcador de trabajo pendiente en `message`, o `undefined`. Pura, sin regex.
 */
export function findPendingMarker(message) {
  if (typeof message !== 'string' || message.length === 0) return undefined;

  const haystack = message.toLowerCase();

  // The list/comment shape "TODO:" is case-sensitive: lowercase "todo:" is the Spanish word "everything".
  // @es La forma de lista "TODO:" distingue mayúsculas: «todo:» en minúscula es la palabra española.
  return message.includes('TODO:') ? 'TODO:' : PENDING_MARKERS.find((marker) => announcesAt(haystack, marker));
}

/**
 * Whether `marker` appears in `haystack` as an ANNOUNCEMENT: at least one occurrence that no negator
 * precedes and, for the «queda por» frames, that an infinitive follows.
 * @es Si `marker` aparece en `haystack` como ANUNCIO: al menos una aparición que ningún negador precede y,
 * en los marcos «queda por», que un infinitivo sigue.
 */
function announcesAt(haystack, marker) {
  for (let at = haystack.indexOf(marker); at !== -1; at = haystack.indexOf(marker, at + 1)) {
    if (!isNegatedBefore(haystack, at) && (!INFINITIVE_FRAMES.includes(marker) || infinitiveFollows(haystack, at + marker.length))) return true;
  }

  return false;
}

/** Whether the text right before `at` voids the phrase (a negator or «lo que»). @es Si lo que precede a `at` anula la frase (un negador o «lo que»). */
function isNegatedBefore(haystack, at) {
  const before = haystack.slice(0, at);

  // The prefix is whole words: «uno » ends in «no » but negates nothing. @es El prefijo son palabras enteras: «uno » acaba en «no » y no niega nada.
  return VOIDING_PREFIXES.some((prefix) => {
    const previous = before[before.length - prefix.length - 1] ?? ' ';

    return before.endsWith(prefix) && previous.toLowerCase() === previous.toUpperCase();
  });
}

/** Whether the word starting after `from` (spaces skipped) is an infinitive: ends in -ar, -er or -ir. @es Si la palabra que sigue a `from` es un infinitivo: acaba en -ar, -er o -ir. */
function infinitiveFollows(haystack, from) {
  let start = from;

  while (haystack[start] === ' ') start += 1;

  let end = start;

  while (end < haystack.length && !' \n\t.,;:!?()'.includes(haystack[end])) end += 1;

  const word = haystack.slice(start, end);

  return INFINITIVE_ENDINGS.some((ending) => word.endsWith(ending));
}
