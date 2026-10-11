/**
 * The bilingual refusal a worker receives when it tries to change the stash stack, in the house form
 * (`bilingual-output/message.mjs`).
 *
 * @es La negativa bilingüe que recibe un worker que intenta cambiar la pila de stashes, en la forma de la casa.
 */

import { render } from '../bilingual-output/message.mjs';

/** The message table; both halves name the same placeholder. @es La tabla de mensajes; ambas mitades nombran el mismo marcador. */
export const MESSAGES = {
  refusal: {
    en: [
      'WORKER-STASH GUARD REFUSED this command: a delegated worker may not change the git stash stack ({command}).',
      '',
      "WHY. `refs/stash` lives in the repository's COMMON git directory, so every linked worktree reads and",
      'writes ONE shared stack. Measured 2026-10-11: workers f4 and f5, each in its own worktree of one repo,',
      'shared it; the `git stash pop` of f5 applied the lint-staged backup stash (124b632f, 7 spec files) of f4',
      "into f5's worktree, and f4 then failed with \"lint-staged automatic backup is missing\".",
      '',
      'USE INSTEAD: commit the work in progress on your OWN branch (a commit is per-branch and nobody else',
      'can pop it):',
      '',
      '  git add -- <paths> && git commit -m "wip(scope): what is half done" -- <paths>',
      '',
      'and let the next commit fix it up. To set the tree aside, commit it; to get it back, `git reset --soft HEAD~1`.',
      'The main session may stash; reading the stack (`git stash list`, `git stash show`) is allowed to you.'
    ],
    es: [
      'WORKER-STASH GUARD RECHAZÓ este comando: un worker delegado no puede cambiar la pila de stashes de git ({command}).',
      '',
      'POR QUÉ. `refs/stash` vive en el directorio git COMÚN del repositorio, así que todo worktree enlazado',
      'lee y escribe UNA sola pila compartida. Medido el 2026-10-11: los workers f4 y f5, cada uno en su propio',
      'worktree de un mismo repo, la compartieron; el `git stash pop` de f5 aplicó el stash de respaldo de',
      'lint-staged (124b632f, 7 ficheros de spec) de f4 en el worktree de f5, y f4 falló con',
      '"lint-staged automatic backup is missing".',
      '',
      'USAR EN SU LUGAR: commitear el trabajo a medias en tu PROPIA rama (un commit es por rama y nadie más',
      'puede hacerle pop):',
      '',
      '  git add -- <rutas> && git commit -m "wip(scope): lo que está a medias" -- <rutas>',
      '',
      'y que el siguiente commit lo arregle. Para apartar el árbol, commitéalo; para recuperarlo, `git reset --soft HEAD~1`.',
      'La sesión principal sí puede hacer stash; leer la pila (`git stash list`, `git stash show`) te está permitido.'
    ]
  }
};

/**
 * @param {string} command The offending invocation's source text.
 * @returns {string} The rendered refusal, English then ` @es ` Spanish.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `.
 */
export function refusalText(command) {
  return render(MESSAGES.refusal, { command });
}
