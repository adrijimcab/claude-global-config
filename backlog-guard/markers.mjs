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
 * a negation («no hace falta hacer nada», «nada pendiente de integrar»). So the verbs «sumo / agrego» are
 * markers only with their destination («a la lista», «como pendiente»); «anoto / apunto» stay bare, since
 * no dismissal is on record for them; «queda por» needs an infinitive after it; and a plain negation
 * («no», «nada», «no hay», «not») voids any marker it directly precedes, while a NOT-YET negation
 * («todavía no lo anoto en el backlog») voids nothing: the item is not recorded yet, so it still fires.
 * «lo dejo pendiente», «queda pendiente» and «quedan pendientes» were added: they announce pending work
 * and none of them fired before.
 * @es FORMAS DE FRASE, NO VERBOS SUELTOS (2026-10-18, por datos): los descartes de `lo sumo`, `lo agrego`,
 * `queda por`, `falta hacer`, `falta integrar` y `pendiente de integrar` eran frases que NO son un ítem
 * pendiente nuevo. Por eso `sumo / agrego` solo son marcador con su destino; `anoto / apunto` siguen
 * sueltos, sin descartes registrados; `queda por` pide un infinitivo; y una negación simple («no», «nada»,
 * «no hay», «not») anula cualquier marcador que precede, mientras una de TODAVÍA NO («todavía no lo anoto en
 * el backlog») no anula nada: el ítem aún no está registrado, y sigue disparando. Se añadieron
 * `lo dejo pendiente`, `queda pendiente` y `quedan pendientes`, que anuncian trabajo pendiente y antes no disparaban.
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
  // «anoto / apunto» stay bare: the dismissal log holds no false positive for them.
  // @es «anoto / apunto» quedan sueltos: el registro de descartes no tiene ningún falso positivo suyo.
  'lo anoto',
  'lo apunto',
  // The verbs «sumo / agrego» are markers only WITH the destination that makes them a new pending item. Alone
  // they also say «I add finished work to a checkpoint» («lo sumo al checkpoint-37», 3 dismissals), «a lo sumo»
  // (at most) and «I would add it if you ask» (1 dismissal); see the 2026-10-18 note.
  // @es Los verbos «sumo / agrego» son marcador solo CON el destino que los vuelve un ítem pendiente nuevo;
  // @es solos también dicen «sumo trabajo terminado a un checkpoint», «a lo sumo» y una oferta.
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
 * Object pronouns an infinitive may carry attached («revisarlo», «hacerla», «moverse»). «me», «te» and «nos»
 * are left out: they let «firme», «parte» and «internos» read as infinitives.
 * @es Pronombres que un infinitivo puede llevar pegados. Se excluyen «me», «te» y «nos»: dejarían pasar
 * «firme», «parte» e «internos» como infinitivos.
 */
const ENCLITICS = Object.freeze(['lo', 'la', 'los', 'las', 'le', 'les', 'se']);

/**
 * The shortest stem an enclitic may attach to. Four characters lets the noun «charla» («char» + «la») pass as
 * an infinitive; the price is that «usarlo», «leerlo» and «unirse» after «queda por» stay silent.
 * @es La raíz más corta a la que se pega un enclítico. Con cuatro, el sustantivo «charla» pasaría por
 * infinitivo; el costo es que «usarlo», «leerlo» y «unirse» tras «queda por» no disparan.
 */
const MIN_ENCLITIC_STEM = 5;

/** Markdown emphasis and code marks that may wrap a word. @es Marcas de markdown que pueden envolver una palabra. */
const WORD_WRAPPERS = '*_`';

/** Characters that end a word: whitespace, punctuation, dashes, the slash, quote marks and markdown wrappers. @es Caracteres que terminan una palabra. */
const WORD_STOPS = ` \n\r\t.,;:!?()—–/"'«»“”‘’${WORD_WRAPPERS}`;

/**
 * Plain negations that, standing right before ANY marker, turn it into its opposite: «no hace falta hacer»,
 * «no hay hallazgo nuevo», «no va al backlog», «no new finding». The text before the marker must END with one
 * of these (the haystack is lowercase).
 * @es Negaciones simples que, justo delante de CUALQUIER marcador, lo vuelven su contrario. El texto previo debe
 * TERMINAR en una de estas.
 */
const VOIDING_PREFIXES = Object.freeze(['no ', 'nada ', 'no hace ', 'no hay ', 'not ', 'no new ']);

/**
 * NOT-YET negations, which void nothing: «todavía no lo anoto en el backlog» says the item is still
 * unrecorded, so it is still pending. Only those ending in a plain negation need listing («not yet» ends in
 * «yet», which voids nothing on its own).
 * @es Negaciones de TODAVÍA NO, que no anulan nada: «todavía no lo anoto» dice que el ítem sigue sin registrar.
 * Solo hace falta listar las que terminan en una negación simple.
 */
const NOT_YET_PREFIXES = Object.freeze(['todavía no ', 'todavia no ', 'aún no ', 'aun no ', 'still not ']);

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
 * Whether `marker` appears in `haystack` as an ANNOUNCEMENT: at least one occurrence that no plain negation
 * voids and, for the «queda por» frames, that an infinitive follows.
 * @es Si `marker` aparece en `haystack` como ANUNCIO: al menos una aparición que ninguna negación simple anula
 * y, en los marcos «queda por», que un infinitivo sigue.
 */
function announcesAt(haystack, marker) {
  for (let at = haystack.indexOf(marker); at !== -1; at = haystack.indexOf(marker, at + 1)) {
    if (!isNegatedBefore(haystack, at) && (!INFINITIVE_FRAMES.includes(marker) || infinitiveFollows(haystack, at + marker.length))) return true;
  }

  return false;
}

/** Whether a plain negation, and not a NOT-YET one, stands right before `at`. @es Si justo antes de `at` hay una negación simple y no una de TODAVÍA NO. */
function isNegatedBefore(haystack, at) {
  const before = haystack.slice(0, at);

  return endsWithWords(before, VOIDING_PREFIXES) && !endsWithWords(before, NOT_YET_PREFIXES);
}

/** Whether `text` ends with one of `prefixes` as whole words. @es Si `text` termina en uno de `prefixes` como palabras enteras. */
function endsWithWords(text, prefixes) {
  // Whole words: «uno » ends in «no » but negates nothing. @es Palabras enteras: «uno » acaba en «no » y no niega nada.
  return prefixes.some((prefix) => {
    const previous = text[text.length - prefix.length - 1] ?? ' ';

    return text.endsWith(prefix) && previous.toLowerCase() === previous.toUpperCase();
  });
}

/**
 * Whether the word starting after `from` is an infinitive, bare or with an attached pronoun: ends in -ar, -er
 * or -ir, or is a stem of at least `MIN_ENCLITIC_STEM` characters ending so, followed by one of `ENCLITICS`.
 * Whitespace and markdown wrappers before it are skipped.
 * @es Si la palabra que sigue a `from` es un infinitivo, solo o con pronombre pegado. Se saltan los espacios y
 * las marcas de markdown que la preceden.
 */
function infinitiveFollows(haystack, from) {
  let start = from;

  while (start < haystack.length && (haystack[start].trim() === '' || WORD_WRAPPERS.includes(haystack[start]))) start += 1;

  let end = start;

  while (end < haystack.length && !WORD_STOPS.includes(haystack[end])) end += 1;

  const word = haystack.slice(start, end);

  return endsAsInfinitive(word) || ENCLITICS.some((pronoun) => word.endsWith(pronoun) && word.length - pronoun.length >= MIN_ENCLITIC_STEM && endsAsInfinitive(word.slice(0, -pronoun.length)));
}

/** Whether `word` ends in -ar, -er or -ir. @es Si `word` acaba en -ar, -er o -ir. */
function endsAsInfinitive(word) {
  return INFINITIVE_ENDINGS.some((ending) => word.endsWith(ending));
}
