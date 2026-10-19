/**
 * The bilingual refusals a worker receives for git commands that discard work, move HEAD or skip the commit
 * hooks, one per family, in the house form (`bilingual-output/message.mjs`). Each names WHY and the working
 * alternative. The Spanish half uses a neutral register (formal imperative or infinitive), never a regional one.
 *
 * @es Las negativas bilingües que recibe un worker por comandos de git que descartan trabajo, mueven HEAD u
 * omiten los hooks de commit, una por familia, en la forma de la casa. Cada una dice POR QUÉ y la alternativa. La
 * mitad en español usa un registro neutro (imperativo formal o infinitivo), nunca uno regional.
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
      'USAR EN SU LUGAR: para quitar del índice, `git restore --staged -- <rutas>` (cambia solo el índice). No mueva',
      'HEAD nunca; un error se corrige con otro commit.'
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
      'POR QUÉ. La rama de un worker la fija su TENANCY, y `checkout -- <ruta>` descarta el trabajo que no está en',
      'un commit, sin vuelta atrás (incidente 25: se ejecutó igual un `git checkout -- <ruta>` denegado).',
      '',
      'USAR EN SU LUGAR: no hace falta nada; el orquestador crea las ramas y los worktrees. Para deshacer un',
      'cambio propio, edite el fichero de vuelta o agregue un commit correctivo.'
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
      'POR QUÉ. Sin `--staged`, o con `--worktree`, `restore` sobrescribe ficheros en disco y el contenido que no',
      'está en un commit se pierde (la misma pérdida que `checkout -- <ruta>`, incidente 25).',
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
      'USAR EN SU LUGAR: `git clean -n` o `git clean --dry-run` lista lo que se borraría y está permitido; un fichero',
      'creado por el propio worker se borra por su nombre.'
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
      'que trabajo sin comprobar llega a la rama (incidente 31: un worker hizo así un commit `wip: ...`).',
      '',
      'USAR EN SU LUGAR: corrija lo que informa el hook y haga commit de nuevo con un mensaje Conventional Commit;',
      'un commit de trabajo a medias también tiene que pasar los hooks.'
    ]
  },
  commitNoPaths: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker must name its paths in `git commit` ({command}).',
      '',
      'WHY. A commit without `-- <paths>` takes everything already staged, `-a`/`--all` stages every tracked change,',
      'and `-i`/`--include` commits everything staged besides the named paths. A pathspec that names no specific',
      'path (`.`, `:/`, `*`, only exclusions, only a variable such as `$FILES`) is the same sweep. After a commit',
      'rejected by commitlint the files stay staged, so the next commit swept them in under the wrong message',
      '(twice), and history rewriting is denied, so it could not be split.',
      '',
      'USE INSTEAD: `git commit -m "<msg>" -- <path> <path>` commits only the named paths. After a rejected commit,',
      'run `git status --porcelain` before the next one.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado debe nombrar sus rutas en `git commit` ({command}).',
      '',
      'POR QUÉ. Un commit sin `-- <rutas>` toma todo lo que ya está en el índice, `-a`/`--all` agrega cada cambio',
      'rastreado, e `-i`/`--include` incluye todo el índice además de las rutas nombradas. Un pathspec que no nombra',
      'rutas concretas (`.`, `:/`, `*`, solo exclusiones, solo una variable como `$FILES`) es el mismo barrido. Tras',
      'un commit rechazado por commitlint los ficheros siguen en el índice, así que el commit siguiente los arrastró',
      'bajo otro mensaje (dos veces), y reescribir historia está denegado, por lo que no se pudo separar.',
      '',
      'USAR EN SU LUGAR: `git commit -m "<msg>" -- <ruta> <ruta>` incluye solo las rutas nombradas. Tras un commit',
      'rechazado, ejecute `git status --porcelain` antes del siguiente.'
    ]
  },
  commitUntracked: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: the pathspec of this `git commit` covers untracked files ({command}).',
      '',
      'WHY. `git commit -- <dir>` silently leaves out an untracked file under `<dir>` and exits 0, so the commit',
      'lands without a file the committed code imports and does not build on its own (Discovery: 26b7227b imported',
      'a file that only landed in 0235cc85). Untracked files under the pathspec ({total} in all, at most 10 shown):',
      '{paths}',
      '',
      'USE INSTEAD: run `git add -- {paths}` first, in its own command or earlier in the same `&&` chain, or name',
      'the files precisely in the pathspec of the commit.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: el pathspec de este `git commit` cubre ficheros sin seguimiento ({command}).',
      '',
      'POR QUÉ. `git commit -- <dir>` deja fuera en silencio un fichero sin seguimiento bajo `<dir>` y sale con 0, así',
      'que el commit aterriza sin un fichero que el código del commit importa y no compila solo (Discovery: 26b7227b',
      'importaba un fichero que solo aterrizó en 0235cc85). Ficheros sin seguimiento bajo el pathspec ({total} en total, se muestran 10 como máximo):',
      '{paths}',
      '',
      'USAR EN SU LUGAR: ejecute antes `git add -- {paths}`, en su propio comando o antes en la misma cadena `&&`, o',
      'nombre los ficheros con precisión en el pathspec del commit.'
    ]
  },
  commitPathspecFile: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: the `--pathspec-from-file` of this `git commit` cannot be read ({command}).',
      '',
      'WHY. The guard checks the paths a commit names for untracked files and for a sweep of the whole index; a',
      'pathspec file it cannot read (`{file}`: standard input, a missing file, or a directory the line does not show)',
      'names paths nobody checked.',
      '',
      'USE INSTEAD: `git commit -m "<msg>" -- <path> <path>`, or a pathspec file that exists, given by a path the',
      'line makes clear.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: el `--pathspec-from-file` de este `git commit` no se puede leer ({command}).',
      '',
      'POR QUÉ. El guard comprueba en las rutas que nombra un commit si hay ficheros sin seguimiento y si barren el',
      'índice entero; un fichero de pathspec que no puede leer (`{file}`: la entrada estándar, un fichero que no',
      'existe o un directorio que la línea no muestra) nombra rutas que nadie comprobó.',
      '',
      'USAR EN SU LUGAR: `git commit -m "<msg>" -- <ruta> <ruta>`, o un fichero de pathspec que exista, dado por una',
      'ruta que la línea deje clara.'
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
      'USAR EN SU LUGAR: informe los commits de su rama; el orquestador publica, y solo después de pasar los gates.'
    ]
  },
  readTree: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not run `git read-tree` on the live index or with `-u` or `--reset` ({command}).',
      '',
      'WHY. `read-tree -u` overwrites the working tree, `--reset` discards the index, and any other `read-tree` into',
      'the live index replaces it (a bare `<tree>`) or empties it (`--empty`, or no tree): the same loss as',
      '`git reset` or `git restore` by the plumbing door (a b100 worker cleared a conflicted index this way).',
      '',
      'USE INSTEAD: commit your work in progress on your branch, or ask the orchestrator to clear the index. To read',
      'a tree, set a temporary `GIT_INDEX_FILE` on the same command line (`GIT_INDEX_FILE=<tmp> git read-tree <tree>`),',
      'use `--index-output=<file>`, or check with `-n`/`--dry-run`; those leave the live index alone and are allowed.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git read-tree` sobre el índice vivo ni con `-u` ni con `--reset` ({command}).',
      '',
      'POR QUÉ. `read-tree -u` sobrescribe el árbol de trabajo, `--reset` descarta el índice, y cualquier otro',
      '`read-tree` sobre el índice vivo lo reemplaza (un `<árbol>` simple) o lo vacía (`--empty`, o sin árbol): la',
      'misma pérdida que `git reset` o `git restore` por la puerta de la plomería (un worker de b100 limpió así un índice en conflicto).',
      '',
      'USAR EN SU LUGAR: haga commit de su trabajo a medias en su rama, o pida al orquestador que limpie el índice.',
      'Para leer un árbol, fije un `GIT_INDEX_FILE` temporal en la misma línea (`GIT_INDEX_FILE=<tmp> git read-tree <árbol>`),',
      'use `--index-output=<fichero>` o compruebe con `-n`/`--dry-run`; eso no toca el índice vivo y está permitido.'
    ]
  },
  checkoutIndex: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not run `git checkout-index` with `-f` or `-a` ({command}).',
      '',
      'WHY. `-f` overwrites existing files and `-a` writes every indexed file, so uncommitted edits on disk are lost',
      '(the same loss as `git checkout -- <path>`).',
      '',
      'USE INSTEAD: commit your work in progress on your branch, or ask the orchestrator. `git checkout-index <file>`',
      'without `-f` leaves existing files alone and is allowed.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git checkout-index` con `-f` ni `-a` ({command}).',
      '',
      'POR QUÉ. `-f` sobrescribe ficheros existentes y `-a` escribe todos los del índice, así que las ediciones en',
      'disco que no están en un commit se pierden (la misma pérdida que `git checkout -- <ruta>`).',
      '',
      'USAR EN SU LUGAR: haga commit de su trabajo a medias en su rama, o pida ayuda al orquestador. `git checkout-index <fichero>`',
      'sin `-f` no toca los ficheros existentes y está permitido.'
    ]
  },
  updateIndex: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not run `git update-index --force-remove` ({command}).',
      '',
      'WHY. `--force-remove` drops a path from the index even though the file is still on disk, so the staged state',
      'of that work is gone with no commit to bring it back.',
      '',
      'USE INSTEAD: commit your work in progress on your branch, or ask the orchestrator. `update-index --refresh`',
      'only reads and is allowed.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git update-index --force-remove` ({command}).',
      '',
      'POR QUÉ. `--force-remove` saca una ruta del índice aunque el fichero siga en disco, así que el estado en',
      'staging de ese trabajo se pierde sin un commit que lo recupere.',
      '',
      'USAR EN SU LUGAR: haga commit de su trabajo a medias en su rama, o pida ayuda al orquestador. `update-index --refresh`',
      'solo lee y está permitido.'
    ]
  },
  updateRef: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not write refs with `git update-ref` ({command}).',
      '',
      'WHY. `update-ref` moves or deletes a branch or tag (and `--stdin` hides which), which can leave commits that',
      'are the only record of the work with no name: the same risk as `git reset` moving HEAD.',
      '',
      'USE INSTEAD: commit on your own branch, or ask the orchestrator; it removes branches once their content is',
      'integrated. To read a ref, use `git rev-parse <ref>`.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede escribir referencias con `git update-ref` ({command}).',
      '',
      'POR QUÉ. `update-ref` mueve o borra una rama o etiqueta (y `--stdin` oculta cuál), lo que puede dejar sin',
      'nombre commits que son el único registro del trabajo: el mismo riesgo que `git reset` moviendo HEAD.',
      '',
      'USAR EN SU LUGAR: haga commit en su propia rama, o pida ayuda al orquestador; él borra las ramas cuando su',
      'contenido ya está integrado. Para leer una referencia, use `git rev-parse <ref>`.'
    ]
  },
  symbolicRef: {
    en: [
      'WORKER-GIT GUARD REFUSED this command: a delegated worker may not repoint or delete a symbolic ref ({command}).',
      '',
      "WHY. A worker's branch is fixed by its TENANCY (the `checkout` reasoning); `symbolic-ref HEAD <ref>` moves HEAD",
      'without touching the files, so the next commit lands on another branch.',
      '',
      'USE INSTEAD: nothing is needed; the orchestrator creates the branches and worktrees. Reading is allowed:',
      '`git symbolic-ref --short HEAD`.'
    ],
    es: [
      'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede reapuntar ni borrar una referencia simbólica ({command}).',
      '',
      'POR QUÉ. La rama de un worker la fija su TENANCY (el razonamiento de `checkout`); `symbolic-ref HEAD <ref>`',
      'mueve HEAD sin tocar los ficheros, así que el siguiente commit cae en otra rama.',
      '',
      'USAR EN SU LUGAR: no hace falta nada; el orquestador crea las ramas y los worktrees. Leer está permitido:',
      '`git symbolic-ref --short HEAD`.'
    ]
  }
};

/**
 * @param {string} family A key of `MESSAGES`.
 * @param {string} command The offending invocation's source text.
 * @param {Record<string, string>} [details] Further placeholders of the family (the untracked paths, the file).
 * @returns {string} The rendered refusal, English then ` @es ` Spanish.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `.
 */
export function refusalText(family, command, details = {}) {
  return render(MESSAGES[family], { command, ...details });
}
