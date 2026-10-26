/**
 * The bilingual refusal of the protected-branch guard, in the house form (`bilingual-output/message.mjs`): every
 * offending command with what it deletes, the owner's rule, the exact-match boundary, the way out for a name that
 * cannot be read, and the statement that the real layer is the server's branch protection.
 *
 * @es La negativa bilingüe de la guardia de ramas protegidas: cada comando infractor con lo que borra, la regla del
 * dueño, el límite de la coincidencia exacta, la salida para un nombre ilegible y que la capa real es la protección
 * de ramas del servidor.
 */

import { render } from '../bilingual-output/message.mjs';
import { PROTECTED_BRANCHES } from './protected-branches.mjs';
import { UNKNOWABLE } from './branch-deletions.mjs';

/** Why a name cannot be read, per language. @es Por qué no se puede leer un nombre, por idioma. */
const UNKNOWABLE_REASONS = {
  [UNKNOWABLE.variable]: { en: 'the branch is named by a variable', es: 'la rama la nombra una variable' },
  [UNKNOWABLE.stdin]: { en: 'the branch names arrive on standard input', es: 'los nombres de rama llegan por la entrada estándar' },
  [UNKNOWABLE.unnamed]: { en: 'it deletes remote branches the line does not name (--mirror / --prune)', es: 'borra ramas remotas que la línea no nombra (--mirror / --prune)' },
  [UNKNOWABLE.headBranch]: { en: 'it deletes the pull request\'s head branch, which the line does not name', es: 'borra la rama de origen del pull request, que la línea no nombra' },
  [UNKNOWABLE.currentBranch]: { en: 'it renames the current branch of a directory that cannot be followed', es: 'renombra la rama actual de un directorio que no se puede seguir' }
};

/** The message table; both halves name the same placeholders. @es La tabla de mensajes; ambas mitades nombran los mismos marcadores. */
export const MESSAGES = {
  refusal: {
    en: [
      'PROTECTED-BRANCH GUARD REFUSED this command: it deletes, or may delete, a protected branch ({protected}).',
      '',
      '{itemsEn}',
      '',
      'WHY. The owner\'s rule, verbatim: «main y develop NUNCA se borran» (main and develop are NEVER deleted),',
      'locally or on a remote. The match is exact: feature/main, main-fix or develop2 are other branches and pass.',
      'A deletion whose names this guard cannot read is refused too: spell every branch name literally',
      '(git branch -d feat/a feat/b), never through a variable, xargs or --mirror/--prune; delete a pull',
      'request\'s head branch by its name (git push origin --delete feat/a), not with gh pr --delete-branch.',
      '',
      'This guard is the client layer only. The real layer is server-side branch protection on the remote',
      '(protect main and develop against deletion there); a client hook is always one flag away from being skipped.'
    ],
    es: [
      'PROTECTED-BRANCH GUARD RECHAZÓ este comando: borra, o puede borrar, una rama protegida ({protected}).',
      '',
      '{itemsEs}',
      '',
      'POR QUÉ. La regla del dueño, literal: «main y develop NUNCA se borran», ni en local ni en un remoto.',
      'La coincidencia es exacta: feature/main, main-fix o develop2 son otras ramas y pasan.',
      'También se rechaza un borrado cuyos nombres esta guardia no puede leer: escribe cada nombre de rama',
      'literalmente (git branch -d feat/a feat/b), nunca con una variable, xargs o --mirror/--prune; borra la rama',
      'de origen de un pull request por su nombre (git push origin --delete feat/a), no con gh pr --delete-branch.',
      '',
      'Esta guardia es solo la capa del cliente. La capa real es la protección de ramas del servidor en el remoto',
      '(protege allí main y develop contra el borrado); un hook de cliente siempre está a un flag de saltarse.'
    ]
  }
};

/** One offender as a line of one language. @es Un infractor como línea de un idioma. */
function itemOf({ text, branch, unknowable }, language) {
  if (branch !== undefined) return language === 'en' ? `  - ${text}: deletes the protected branch ${branch}` : `  - ${text}: borra la rama protegida ${branch}`;

  return `  - ${text}: ${UNKNOWABLE_REASONS[unknowable][language]}`;
}

/**
 * @param {Array<{ text: string, branch?: string, unknowable?: string }>} offenders What `protectedBranchDeletions` found.
 * @returns {string} The rendered refusal, English then ` @es ` Spanish.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `.
 */
export function refusalText(offenders) {
  return render(MESSAGES.refusal, {
    protected: PROTECTED_BRANCHES.join(', '),
    itemsEn: offenders.map((offender) => itemOf(offender, 'en')).join('\n'),
    itemsEs: offenders.map((offender) => itemOf(offender, 'es')).join('\n')
  });
}
