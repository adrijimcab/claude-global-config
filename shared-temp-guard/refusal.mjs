/**
 * The bilingual refusal a delegated agent receives when it writes into the shared TEMP root, in the house form
 * (`bilingual-output/message.mjs`).
 *
 * @es La negativa bilingüe que recibe un agente delegado que escribe en la raíz TEMP compartida, en la forma de la casa.
 */

import { render } from '../bilingual-output/message.mjs';

/** The message table; both halves name the same placeholders. @es La tabla de mensajes; ambas mitades nombran los mismos marcadores. */
export const MESSAGES = {
  refusal: {
    en: [
      'SHARED-TEMP GUARD REFUSED this write: a delegated agent may not write into the shared TEMP root ({target}, via {via}).',
      '',
      'WHY. The TEMP root is ONE directory for every live session, and generic names collide there. Measured',
      '2026-10-12: one worker read another session\'s edit6.mjs, and another committed with an m1.txt message file',
      'that a different session had overwritten. Measured again 2026-10-18: a worker wrote its mutant-campaign',
      "output to the shared /tmp and a peer's reaper campaign overwrote it.",
      '',
      'USE INSTEAD: write under your own WORKTREE (for scratch output, <worktree>/scratch/) or under your session',
      'SCRATCHPAD (<tmp>/claude/<project>/<session>/scratchpad/, the path your session prompt names), with a',
      'name that is unique to you. For a commit message, `git commit -F <file in your worktree or scratchpad>`.',
      'The main session is not judged; its scratchpad already lives under <tmp>/claude/.'
    ],
    es: [
      'SHARED-TEMP GUARD RECHAZÓ esta escritura: un agente delegado no puede escribir en la raíz TEMP compartida ({target}, vía {via}).',
      '',
      'POR QUÉ. La raíz TEMP es UN solo directorio para todas las sesiones vivas, y los nombres genéricos chocan',
      'allí. Medido el 2026-10-12: un worker leyó el edit6.mjs de otra sesión, y otro hizo commit con un fichero',
      'de mensaje m1.txt que una sesión distinta había sobrescrito. Medido de nuevo el 2026-10-18: un worker',
      'escribió la salida de su campaña de mutantes en el /tmp compartido y la campaña del reaper de un par la',
      'sobrescribió.',
      '',
      'USAR EN SU LUGAR: escribir bajo tu propio WORKTREE (para salida temporal, <worktree>/scratch/) o bajo el',
      'SCRATCHPAD de tu sesión (<tmp>/claude/<proyecto>/<sesión>/scratchpad/, la ruta que nombra el prompt de tu',
      'sesión), con un nombre único tuyo. Para un mensaje de commit, `git commit -F <fichero en tu worktree o scratchpad>`.',
      'La sesión principal no se juzga; su scratchpad ya vive bajo <tmp>/claude/.'
    ]
  }
};

/**
 * @param {string} target The offending absolute path.
 * @param {string} via How the call writes it (a redirect, the Write tool, `git commit -F`, ...).
 * @returns {string} The rendered refusal, English then ` @es ` Spanish.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `.
 */
export function refusalText(target, via) {
  return render(MESSAGES.refusal, { target, via });
}
