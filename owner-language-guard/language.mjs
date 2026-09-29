/**
 * Cuenta de marcadores de idioma en una lista de palabras de prosa.
 *
 * Método: frecuencia de PALABRAS FUNCIONALES (artículos, preposiciones, pronombres, auxiliares). Son
 * la gramática del idioma, aparecen en cualquier oración y no se «prestan»: un párrafo en español
 * denso en jerga técnica inglesa (commit, merge, build, pipeline, gate, worktree) sigue armado con
 * «el», «que», «de», «para», mientras que «Running the real sync now.» se arma con «the» y «now».
 * Los sustantivos técnicos no figuran en ninguna lista, así que no suman para ningún lado.
 *
 * Criterio de las listas: SOLO palabras que no existen como palabra corriente en el otro idioma.
 * Excluidas a propósito por ambiguas: «a», «no», «me», «he», «has», «once», «era», «sin»,
 * «come», «as», «real», «final», «total». Un marcador ambiguo sumaría a los dos lados y le quitaría
 * poder de discriminación a la cuenta.
 *
 * Refuerzo del español: una palabra con ñ, tilde o diéresis cuenta como marcador español aunque no
 * esté en la lista, porque el inglés no usa esos caracteres en prosa corriente.
 */

export const ENGLISH_MARKERS = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'to', 'of', 'and', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'into', 'onto', 'about', 'over', 'under',
  'after', 'before', 'while', 'until', 'since', 'through', 'without', 'within',
  'that', 'this', 'these', 'those', 'which', 'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how',
  'it', 'its', "it's", 'i', "i'm", "i'll", "i've", "i'd", 'you', "you're", 'we', "we're", "we'll", 'they', "they're",
  'she', 'him', 'her', 'his', 'our', 'your', 'their', 'them', 'my', 'us',
  'have', 'had', 'having', 'do', 'does', 'did', 'done', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "won't", "can't", "couldn't", "shouldn't", "haven't", "hasn't",
  'not', 'but', 'or', 'if', 'so', 'than', 'then', 'there', "there's", 'here', 'now', 'just', 'also', 'still', 'already',
  'all', 'any', 'some', 'each', 'every', 'both', 'only', 'very', 'more', 'most', 'other', 'another', 'such',
  'an', 'because', 'whether', 'let', "let's", 'yet', 'again', 'next', 'first', 'got', 'get', 'going',
  // Verbos de las líneas de progreso entre herramientas. No son gramática, pero MEDIDO sobre la sesión
  // c45d798b: ninguno aparece en los 4963 párrafos reales en español, y sí en los párrafos en inglés
  // («Checking it:», «Launching the next two tasks.»). Quedan FUERA «check», «fix» y «run»: aparecen
  // 26, 23 y 3 veces en párrafos en español como jerga («el check», «el fix»).
  'checking', 'running', 'launching', 'looking', 'reading', 'fixing', 'verifying', 'integrating', 'waiting',
  'starting', 'moving', 'retrying', 'writing', 'found', 'kept', 'changed', 'landed', 'finished', 'resumed',
  'instead', 'something', 'nothing', 'everything', 'need', 'needs', 'want'
]);

export const SPANISH_MARKERS = new Set([
  'el', 'la', 'los', 'las', 'lo', 'un', 'una', 'unos', 'unas', 'al', 'del',
  'que', 'y', 'e', 'o', 'u', 'ni', 'pero', 'porque', 'aunque', 'si', 'sino', 'pues',
  'en', 'por', 'para', 'con', 'desde', 'hasta', 'entre', 'sobre', 'hacia', 'contra', 'según', 'tras',
  'es', 'son', 'eran', 'fue', 'fueron', 'ser', 'sido', 'está', 'están', 'estaba', 'estar', 'hay', 'había',
  'tiene', 'tienen', 'tenía', 'hace', 'hizo', 'hecho', 'puede', 'pueden', 'debe', 'va', 'van', 'voy', 'vamos',
  'se', 'le', 'les', 'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'nos', 'te', 'yo', 'vos', 'sos', 'ellos', 'ella', 'él',
  'este', 'esta', 'esto', 'estos', 'estas', 'ese', 'esa', 'eso', 'esos', 'esas', 'aquel', 'aquello',
  'qué', 'cómo', 'cuándo', 'dónde', 'cuál', 'quién', 'cuando', 'donde', 'como', 'cual', 'quien',
  'más', 'menos', 'muy', 'ya', 'aún', 'todavía', 'también', 'tampoco', 'solo', 'sólo', 'nada', 'algo', 'todo', 'todos',
  'toda', 'todas', 'cada', 'otro', 'otra', 'otros', 'otras', 'mismo', 'misma', 'ahora', 'acá', 'ahí', 'allá',
  'así', 'bien', 'mal', 'sí', 'dos', 'tres', 'cuatro', 'cinco', 'listo', 'lista', 'che', 'dale', 'bueno'
]);

const SPANISH_LETTERS = new Set([...'ñáéíóúü']);

const hasSpanishLetter = (word) => [...word].some((ch) => SPANISH_LETTERS.has(ch));

/** `{ english, spanish }`: cuántas palabras de la lista marcan cada idioma. */
export function tally(words) {
  let english = 0;
  let spanish = 0;

  for (const word of words) {
    if (ENGLISH_MARKERS.has(word)) english += 1;
    else if (SPANISH_MARKERS.has(word) || hasSpanishLetter(word)) spanish += 1;
  }

  return { english, spanish };
}
