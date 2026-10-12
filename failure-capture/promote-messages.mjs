/**
 * What `capture.mjs` says about a PROMOTION — the instructions a recurring lesson owes, every refusal of
 * `promote`, the growth refusal and the report of a closed promotion — every sentence in the house
 * bilingual form (`bilingual-output/message.mjs`): English first, the Spanish half marked `@es`, never one without the
 * other. Data (paths, keys, the closure reason) travels as `{name}` placeholders; commands the reader
 * copies are printed as data, untranslated.
 *
 * @es Lo que dice `capture.mjs` de una PROMOCIÓN: las instrucciones que debe una lección recurrente, cada
 * negativa de `promote`, la negativa por crecimiento y el informe de una promoción cerrada; cada frase en la
 * forma bilingüe de la casa: primero el inglés, la mitad española marcada `@es`, nunca una sin la otra. Los
 * datos (rutas, claves, el motivo del cierre) viajan como marcadores `{nombre}`; los comandos que el lector
 * copia se imprimen como dato, sin traducir.
 */

export const PROMOTE_MESSAGES = {
  // --- the steps a recurring lesson owes
  'instructions.global': {
    en: ['PROMOTION REQUIRED -> the GLOBAL promoted-rules file (a global lesson: every project and subagent loads it).', '  1. Add the rule to {file}, and include the literal token "{key}" in it.'],
    es: ['PROMOCIÓN REQUERIDA -> el fichero GLOBAL de reglas promovidas (una lección global: todo proyecto y subagente lo carga).', '  1. Añade la regla a {file} e incluye en ella el token literal "{key}".']
  },
  'instructions.global.tail': { en: '     It refuses until the token is actually there. Do not hand-edit the ledger instead.', es: '     Se niega hasta que el token esté de verdad. No edites el ledger a mano en su lugar.' },
  'instructions.close': { en: '  {number}. Close it with a MECHANISM that makes the repeat impossible, or say why none is possible:', es: '  {number}. Ciérrala con un MECANISMO que haga imposible la repetición, o di por qué no cabe ninguno:' },
  'instructions.close.note': { en: '     The mechanism must name the key and its selftest.mjs is RUN and must pass; the reason is recorded verbatim and must carry both languages (English, then @es, then Spanish).', es: '     El mecanismo debe nombrar la clave y su selftest.mjs se EJECUTA y debe pasar; el motivo se registra literal y debe llevar los dos idiomas (inglés, luego @es, luego español).' },
  'instructions.contract': { en: 'PROMOTION REQUIRED -> the DELEGATED-WORKER contract of {scope} ({count} file(s)).', es: 'PROMOCIÓN REQUERIDA -> el contrato de WORKER DELEGADO de {scope} ({count} fichero(s)).' },
  'instructions.contract.gate': { en: 'PROMOTION REQUIRED -> the DELEGATED-WORKER contract of {scope} ({count} file(s) and its parity declaration).', es: 'PROMOCIÓN REQUERIDA -> el contrato de WORKER DELEGADO de {scope} ({count} fichero(s) y su declaración de paridad).' },
  'instructions.contract.many': { en: 'A rule added to one file only means workers on another runtime silently never receive it.', es: 'Una regla añadida a un solo fichero significa que los workers de otro runtime no la reciben nunca, en silencio.' },
  'instructions.contract.step': { en: '  {number}. Add the rule to {file}, including the literal token "{key}".', es: '  {number}. Añade la regla a {file}, incluyendo el token literal "{key}".' },
  'instructions.contract.parity': { en: '  {number}. Add "{key}" to the "anchors" list of {file}, so the shared parity engine enforces the files from now on.', es: '  {number}. Añade "{key}" a la lista "anchors" de {file}, para que el motor de paridad compartido haga cumplir los ficheros desde ahora.' },
  'instructions.contract.tail': { en: '     It verifies every step; it refuses while any step is missing.', es: '     Verifica cada paso; se niega mientras falte alguno.' },
  'instructions.contract.tail.gate': { en: '     It verifies every step and checks the contract parity; it refuses while any step is missing.', es: '     Verifica cada paso y comprueba la paridad de contrato; se niega mientras falte alguno.' },

  // --- refusals of `promote`
  'promote.keyInvalid': { en: 'promote REFUSED — --key must be a valid lesson key.', es: 'promote RECHAZADO: --key debe ser una clave de lección válida.' },
  'promote.notALesson': { en: 'promote REFUSED — "{key}" is not a lesson in the ledger. Nothing to promote.', es: 'promote RECHAZADO: "{key}" no es una lección del ledger. Nada que promover.' },
  'promote.noClosure': { en: 'promote REFUSED — no valid closure:', es: 'promote RECHAZADO: no hay un cierre válido:' },
  'promote.notLanded': { en: 'promote REFUSED — the rule has not actually landed:', es: 'promote RECHAZADO: la regla no ha aterrizado de verdad:' },
  'promote.missing.token': { en: '  - the token "{key}" is absent from {file}', es: '  - el token "{key}" no está en {file}' },
  'promote.missing.anchor': { en: '  - "{key}" is not in the "anchors" list of {file}', es: '  - "{key}" no está en la lista "anchors" de {file}' },
  'promote.alreadyPromoted': { en: 'promote REFUSED — the rule was already promoted and the lesson came back anyway:', es: 'promote RECHAZADO: la regla ya estaba promovida y la lección volvió igualmente:' },
  'promote.parityRed': { en: 'promote REFUSED — the contract parity check is RED after your edit:', es: 'promote RECHAZADO: la comprobación de paridad del contrato está en ROJO tras tu edición:' },
  'promote.paritySkipped': { en: 'promote REFUSED — contract parity was not measured: the {sides} contract of {file} has no file on this machine, so nothing was compared.', es: 'promote RECHAZADO: la paridad de contrato no se midió: el contrato {sides} de {file} no tiene ningún fichero en esta máquina, así que no se comparó nada.' },
  'promote.mechanismFailed': { en: 'promote REFUSED — the mechanism does not close this lesson:', es: 'promote RECHAZADO: el mecanismo no cierra esta lección:' },
  'promote.locked': { en: 'promote: the ledger is locked by another writer — re-run in a moment. Nothing was changed.', es: 'promote: el ledger está bloqueado por otro escritor; reintenta en un momento. No se cambió nada.' },
  'promote.lessonGone': { en: 'promote REFUSED — the lesson is no longer in the ledger.', es: 'promote RECHAZADO: la lección ya no está en el ledger.' },

  // --- the growth refusal, one block per file that did not grow
  'growth.file': {
    en: ['"{key}" has recurred since it was last closed on {date}, and the text that failed to prevent it has not grown:', '  {file}', '  names {now} face(s) of "{key}"; it named {then} face(s) at that closure.'],
    es: ['"{key}" ha reincidido desde que se cerró el {date}, y el texto que no lo previno no ha crecido:', '  {file}', '  nombra {now} cara(s) de "{key}"; nombraba {then} en ese cierre.']
  },
  'growth.advice': {
    en: ['A promoted rule prevents only the FACES ITS TEXT NAMES. Read the existing paragraph, decide whether', 'this recurrence is a face it already names, and when it is not, EXTEND it with the new face — in', 'every file that carries the rule — before promoting again.'],
    es: ['Una regla promovida solo previene las CARAS QUE SU TEXTO NOMBRA. Lee el párrafo existente, decide si', 'esta reincidencia es una cara que ya nombra y, cuando no lo es, EXTIÉNDELO con la cara nueva, en', 'cada fichero que lleve la regla, antes de volver a promover.']
  },

  // --- a closed promotion
  'promote.done': { en: 'PROMOTED "{key}".', es: 'PROMOVIDA "{key}".' },
  'promote.landed.global': { en: 'Landed in the global promoted-rules file: {files}', es: 'Aterrizó en el fichero global de reglas promovidas: {files}' },
  'promote.landed.contract': { en: 'Landed in the delegated-worker contract ({count} file(s)): {files}', es: 'Aterrizó en el contrato de worker delegado ({count} fichero(s)): {files}' },
  'promote.proof.token': { en: 'Verified on disk: token present in the file.', es: 'Verificado en disco: token presente en el fichero.' },
  'promote.proof.contracts': { en: 'Verified on disk: token present in {count} contract file(s); this project declares no contract parity.', es: 'Verificado en disco: token presente en {count} fichero(s) de contrato; este proyecto no declara paridad de contrato.' },
  'promote.proof.contractsGate': { en: 'Verified on disk: token present in {count} contract file(s) and in the "anchors" list; the shared parity engine ran and found parity.', es: 'Verificado en disco: token presente en {count} fichero(s) de contrato y en la lista "anchors"; el motor de paridad compartido corrió y halló paridad.' },
  'promote.closed.mechanism': { en: 'Closed by mechanism {path} (selftest run, exit 0).', es: 'Cerrada por el mecanismo {path} (selftest ejecutado, salida 0).' },
  // The reason itself follows as a data line, as written, in the two languages its author gave it.
  // @es El motivo mismo sigue como línea de datos, tal cual, en los dos idiomas en que lo dio su autor.
  'promote.closed.reason': { en: 'No mechanism is possible; the reason, as recorded:', es: 'No cabe mecanismo; el motivo, tal como se registró:' },
  'promote.stub': { en: 'The ledger line is now a stub, so the lesson costs a fraction of the tokens it did.', es: 'La línea del ledger ahora es un muñón, así que la lección cuesta una fracción de los tokens que costaba.' }
};
