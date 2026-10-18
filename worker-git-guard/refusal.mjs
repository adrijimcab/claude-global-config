/**
 * The bilingual refusals a worker receives for git commands that discard work, move HEAD or skip the commit
 * hooks, one per family, in the house form (`bilingual-output/message.mjs`). Each names WHY and the working
 * alternative.
 *
 * @es Las negativas bilingües que recibe un worker por comandos de git que descartan trabajo, mueven HEAD u
 * omiten los hooks de commit, una por familia, en la forma de la casa. Cada una dice POR QUÉ y la alternativa.
 */

import { render } from '../bilingual-output/message.mjs';

/** The message table, keyed by family; both halves name the same placeholder. @es La tabla de mensajes por familia. */
export const MESSAGES = {
  reset: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not run `git reset` ({command}).',
      '',
      "WHY. `reset` moves HEAD or rewrites the index, so it can drop or hide commits that are the branch's only",
      'record of the work (incidents 25 and 25b: `reset --soft <sha>` twice, then `reset -q` just to unstage).',
      '',
      'USE INSTEAD: to unstage, `git restore --staged -- <paths>` (it changes only the index). Never move HEAD;',
      'a mistake is fixed by another commit.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git reset` ({command}).',
      '',
      'POR QUÉ. `reset` mueve HEAD o reescribe el índice, así que puede soltar u ocultar commits que son el único',
      'registro del trabajo de la rama (incidentes 25 y 25b: `reset --soft <sha>` dos veces, y `reset -q` solo para quitar del índice).',
      '',
      'USAR EN SU LUGAR: para quitar del índice, `git restore --staged -- <rutas>` (cambia solo el índice). Nunca',
      'muevas HEAD; un error se arregla con otro commit.'
    ]
  },
  checkout: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not run `git checkout` or `git switch` ({command}).',
      '',
      "WHY. A worker's branch is fixed by its TENANCY, and `checkout -- <path>` throws away uncommitted work",
      'with no way back (incident 25: a denied `git checkout -- <path>` was run anyway).',
      '',
      'USE INSTEAD: nothing is needed; the orchestrator creates the branches and worktrees. To undo your own',
      'change, edit the file back or add a corrective commit.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git checkout` ni `git switch` ({command}).',
      '',
      'POR QUÉ. La rama de un worker la fija su TENANCY, y `checkout -- <ruta>` tira el trabajo sin commitear',
      'sin vuelta atrás (incidente 25: se ejecutó igual un `git checkout -- <ruta>` denegado).',
      '',
      'USAR EN SU LUGAR: no hace falta nada; el orquestador crea las ramas y los worktrees. Para deshacer un',
      'cambio propio, devolvé el fichero editándolo o agregá un commit correctivo.'
    ]
  },
  restore: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not run `git restore` on the working tree ({command}).',
      '',
      'WHY. Without `--staged`, or with `--worktree`, `restore` overwrites files on disk and the uncommitted',
      'content is gone (the same loss as `checkout -- <path>`, incident 25).',
      '',
      'USE INSTEAD: `git restore --staged -- <paths>` changes only the index and is allowed.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git restore` sobre el árbol de trabajo ({command}).',
      '',
      'POR QUÉ. Sin `--staged`, o con `--worktree`, `restore` sobrescribe ficheros en disco y el contenido sin',
      'commitear se pierde (la misma pérdida que `checkout -- <ruta>`, incidente 25).',
      '',
      'USAR EN SU LUGAR: `git restore --staged -- <rutas>` cambia solo el índice y está permitido.'
    ]
  },
  clean: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not run a forced `git clean` ({command}).',
      '',
      'WHY. `clean -f` deletes untracked files for good; git has no copy of them, so the work cannot be recovered.',
      '',
      'USE INSTEAD: `git clean -n` or `git clean --dry-run` lists what would go and is allowed; remove a file you',
      'created yourself by name.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar un `git clean` forzado ({command}).',
      '',
      'POR QUÉ. `clean -f` borra ficheros sin seguimiento para siempre; git no guarda copia, así que el trabajo',
      'no se recupera.',
      '',
      'USAR EN SU LUGAR: `git clean -n` o `git clean --dry-run` lista lo que se iría y está permitido; un fichero',
      'creado por vos se borra por su nombre.'
    ]
  },
  commitNoVerify: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not skip the commit hooks ({command}).',
      '',
      'WHY. `commit --no-verify` (or `-n`) skips commitlint and the pre-commit hook (lint-staged, typecheck), so',
      'unchecked work lands on the branch (incident 31: a worker committed `wip: ...` that way).',
      '',
      'USE INSTEAD: fix what the hook reports and commit again with a Conventional Commit message; a work in',
      'progress commit still has to pass the hooks.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede saltarse los hooks de commit ({command}).',
      '',
      'POR QUÉ. `commit --no-verify` (o `-n`) omite commitlint y el hook pre-commit (lint-staged, typecheck), así',
      'que trabajo sin comprobar llega a la rama (incidente 31: un worker commiteó `wip: ...` así).',
      '',
      'USAR EN SU LUGAR: arreglá lo que informa el hook y commiteá de nuevo con un mensaje Conventional Commit;',
      'un commit de trabajo a medias también tiene que pasar los hooks.'
    ]
  },
  pushNoVerify: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not skip the push hooks ({command}).',
      '',
      'WHY. `push --no-verify` skips the pre-push hook (the test gate), the same bypass as `commit --no-verify`',
      '(incident 31), only later and farther from the work.',
      '',
      'USE INSTEAD: report the commits on your branch; the orchestrator publishes, and only after the gates pass.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede saltarse los hooks de push ({command}).',
      '',
      'POR QUÉ. `push --no-verify` omite el hook pre-push (la puerta de tests), el mismo atajo que',
      '`commit --no-verify` (incidente 31), solo que más tarde y más lejos del trabajo.',
      '',
      'USAR EN SU LUGAR: informá los commits de tu rama; el orquestador publica, y solo después de pasar los gates.'
    ]
  }
};

/**
 * @param {string} family A key of `MESSAGES`.
 * @param {string} command The offending invocation's source text.
 * @returns {string} The rendered refusal, English then ` @es ` Spanish.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `.
 */
export function refusalText(family, command) {
  return render(MESSAGES[family], { command });
}
