/**
 * Pending-work markers — the PREFILTER of the pending-item judge (`../pending-judge/`).
 *
 * WHAT THIS IS AND IS NOT. These strings LOCATE a message that MAY leave something pending; they never decide
 * that it does. The decision belongs to the judge model (`../pending-judge/prompt.mjs`), consulted only when a
 * marker is found, so a message with no marker costs no model call. A lexical list cannot judge intent: five
 * rounds of narrowing it (negation prefixes, infinitive frames, enclitics) each moved the boundary and opened a
 * new edge, and the judges of 2026-10-19 escalated. So this list does ONE thing: it is broad. WHEN UNSURE, A
 * PHRASE IS A MARKER: a false hit costs one cheap model call, a miss costs an unrecorded finding. No negation,
 * infinitive or pronoun logic lives here, and none may return.
 *
 * A SUPERSET OF THE DELETED GUARD. Every phrase the lexical backlog guard caught at commit 0aeeb88 still reaches the
 * judge; `fixtures/deleted-markers-0aeeb88.json` holds that list, taken from the commit's own text, and the selftest
 * walks it.
 *
 * WHOLE WORDS. A marker matches only where no letter or digit touches it on either side, so «bug» never fires on
 * «debug» and «to do» never on «to document» (both cost a model call for nothing). A marker written with a trailing
 * `*` is a STEM: it still needs a word start, but takes any ending («bug*» is «bugs», «encol*» is «encolo» and
 * «encolar»). Every other marker is a whole word or phrase.
 *
 * `grep localiza, NO dictamina` (lessons ledger 2026-08-03). No regex (owner mandate M5): substring search.
 *
 * @es Marcadores de trabajo pendiente — el PREFILTRO del juez de ítems pendientes. LOCALIZAN un mensaje que
 * PUEDE dejar algo pendiente; nunca deciden que lo deja. La decisión es del modelo juez, consultado solo si hay
 * marcador, así que un mensaje sin marcador no cuesta llamada. Una lista léxica no puede juzgar la intención:
 * cinco rondas de estrecharla abrieron un borde nuevo cada vez. Esta lista hace UNA cosa: ser amplia. EN LA
 * DUDA, UNA FRASE ES MARCADOR: un acierto falso cuesta una llamada barata, un fallo cuesta un hallazgo sin
 * registrar. Aquí no vive lógica de negación, infinitivos ni pronombres, y no debe volver. Es un SUPERCONJUNTO de
 * la guardia eliminada: cada frase que atrapaba en el commit 0aeeb88 sigue llegando al juez. PALABRAS ENTERAS: un
 * marcador solo coincide donde ninguna letra ni dígito lo toca, así «bug» no salta en «debug» ni «to do» en «to
 * document»; un marcador con `*` final es una RAÍZ: pide inicio de palabra y admite cualquier terminación.
 */

/**
 * Lowercase phrases and stems that may announce something left for later. The caller lowercases the message.
 * @es Frases y raíces en minúscula que pueden anunciar algo para más tarde. Quien llama pasa el mensaje a minúsculas.
 */
export const PENDING_MARKERS = Object.freeze([
  // --- Queueing and recording verbs and their destination. @es Verbos de encolar y registrar, y su destino.
  'backlog*',
  'encol*',
  'queue*',
  'anoto',
  'apunto',
  'anotar*',
  'apuntar*',
  'lo sumo',
  'lo agrego',
  'sumo al',
  'agrego al',
  'paso al',
  'hallazgo*',
  'finding*',
  'to the list',
  'a la lista',

  // --- The pending noun and the verbs of what remains. @es El sustantivo pendiente y los verbos de lo que resta.
  'pendiente*',
  'pending',
  'queda por',
  'quedan por',
  'queda sin',
  'quedan sin',
  'queda abiert*',
  'quedan abiert*',
  'sigue abiert*',
  'siguen abiert*',
  'still open',
  'remains open',
  'remain open',
  'left open',
  'left for',
  'leave for',
  'falta',
  'faltan',
  'remaining',
  'unresolved',
  'sin resolver',
  'sin lanzar',
  'sin integrar',
  'sin commitear',
  'sin registrar',
  'sin anotar',
  'sin guardar',
  'uncommitted',
  'unrecorded',
  'not recorded',
  'not saved',
  'not committed',

  // --- Deferral. @es Aplazamiento.
  'todavía no',
  'todavia no',
  'aún no',
  'aun no',
  'not yet',
  'yet to',
  'for later',
  'later on',
  'more later',
  'para después',
  'para despues',
  'lo veo después',
  'lo veo despues',
  'más adelante',
  'mas adelante',
  'más tarde',
  'mas tarde',
  'follow-up*',
  'followup*',
  'next round',
  'siguiente ronda',
  // Until an event: the item put off past a wait (L17 case 3). @es Hasta un evento: el ítem diferido tras una espera.
  'cuando aterrice',
  'cuando termine',
  'cuando llegue',
  'when it lands',
  'once it lands',
  'after the landing',

  // --- A defect, debt or decision named. @es Un defecto, deuda o decisión nombrados.
  'defecto*',
  'defect*',
  'deuda*',
  'debt*',
  'bug*',
  'decisión',
  'decision*',
  'needs the owner',
  'dueño*',
  'out of scope',
  'fuera de alcance',
  'fuera del alcance',
  'a decidir',
  'to decide',
  'por hacer',
  'to do',
  'to-do*',
  'por revisar',
  'to review',
  'worth flagging',
  'worth your attention',
  'flag this',
  'flagging this',
]);

/** The suffix that marks a stem. @es El sufijo que marca una raíz. */
const STEM = '*';

/** Whether `character` belongs to a word: a letter of any script, or a digit. @es Si `character` es parte de una palabra: una letra de cualquier alfabeto o un dígito. */
function isWordCharacter(character) {
  if (character === undefined) return false;

  return character.toLowerCase() !== character.toUpperCase() || (character >= '0' && character <= '9');
}

/**
 * Whether `marker` occurs in `haystack` as a word: no word character right before it and, unless it is a stem,
 * none right after it.
 * @es Si `marker` aparece en `haystack` como palabra: sin carácter de palabra justo antes y, salvo que sea raíz,
 * tampoco justo después.
 */
function occursAsWord(haystack, marker) {
  const stem = marker.endsWith(STEM);
  const phrase = stem ? marker.slice(0, -STEM.length) : marker;

  for (let at = haystack.indexOf(phrase); at !== -1; at = haystack.indexOf(phrase, at + 1)) {
    if (!isWordCharacter(haystack[at - 1]) && (stem || !isWordCharacter(haystack[at + phrase.length]))) return true;
  }

  return false;
}

/**
 * The first marker in `text` (a stem without its `*`), or `undefined`. `TODO:` is the list/comment shape and is
 * case-sensitive: lowercase «todo:» is the Spanish word «everything». Pure, no regex.
 * @es El primer marcador en `text` (una raíz sin su `*`), o `undefined`. `TODO:` distingue mayúsculas: «todo:» en
 * minúscula es la palabra española.
 */
export function findPendingMarker(text) {
  if (typeof text !== 'string' || text.length === 0) return undefined;

  if (text.includes('TODO:')) return 'TODO:';

  const haystack = text.toLowerCase();
  const found = PENDING_MARKERS.find((marker) => occursAsWord(haystack, marker));

  return found?.endsWith(STEM) ? found.slice(0, -STEM.length) : found;
}
