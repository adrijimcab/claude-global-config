/**
 * Every sentence the selftest runner prints, as a bilingual table rendered through `bilingual-output/`. The
 * `GREEN`/`RED` status lines are data (a token, a path, an exit status) and are not here.
 *
 * @es Cada frase que imprime el runner de selftests, como tabla bilingüe renderizada por `bilingual-output/`.
 * Las líneas de estado `GREEN`/`RED` son datos (un token, una ruta, un estado de salida) y no están aquí.
 */

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGES = {
  summary: {
    en: '{green}/{total} green',
    es: '{green}/{total} en verde'
  },
  'concurrency-override': {
    en: 'Running {concurrency} selftests at once: SELFTEST_CONCURRENCY says so. Each selftest gets a concurrency budget of {childBudget}.',
    es: 'Corren {concurrency} selftests a la vez: lo dice SELFTEST_CONCURRENCY. Cada selftest recibe un presupuesto de concurrencia de {childBudget}.'
  },
  'concurrency-budget': {
    en: 'Running {concurrency} selftests at once: bound by CONCURRENCY_BUDGET={budget}, below what the machine allows. Each selftest gets a concurrency budget of {childBudget}.',
    es: 'Corren {concurrency} selftests a la vez: acotado por CONCURRENCY_BUDGET={budget}, por debajo de lo que admite la máquina. Cada selftest recibe un presupuesto de concurrencia de {childBudget}.'
  },
  'concurrency-cores': {
    en: 'Running {concurrency} selftests at once: bound by the cores ({cores} cores, {left} left free). Each selftest gets a concurrency budget of {childBudget}.',
    es: 'Corren {concurrency} selftests a la vez: acotado por los núcleos ({cores} núcleos, {left} libres). Cada selftest recibe un presupuesto de concurrencia de {childBudget}.'
  },
  'concurrency-memory': {
    en: 'Running {concurrency} selftests at once: bound by free memory ({freeMib} MiB free, {sharePercent}% usable, {peakMib} MiB peak per selftest). Each selftest gets a concurrency budget of {childBudget}.',
    es: 'Corren {concurrency} selftests a la vez: acotado por la memoria libre ({freeMib} MiB libres, {sharePercent}% utilizable, {peakMib} MiB de pico por selftest). Cada selftest recibe un presupuesto de concurrencia de {childBudget}.'
  },
  'nothing-found': {
    en: 'No selftest found in {root}; nothing was measured.',
    es: 'No se encontró ningún selftest en {root}; no se midió nada.'
  },
  usage: {
    en: 'Usage: node run.mjs [--root <dir> [--git-dir <dir>]]. No filter or skip option exists.',
    es: 'Uso: node run.mjs [--root <dir> [--git-dir <dir>]]. No existe ninguna opción de filtro ni de salto.'
  },
  'lock-required': {
    en: 'REFUSED: the selftest runner is a full chain and starts only while the full-chain lock is held for it; {variable} is missing, stale, or does not match the live holder of the lock. Nothing was run. Run it through the lock: {command}',
    es: 'RECHAZADO: el runner de selftests es una cadena completa y arranca solo mientras el lock de cadenas completas se mantiene para él; {variable} falta, caducó o no coincide con el dueño vivo del lock. No se ejecutó nada. Ejecútalo por el lock: {command}'
  },
  missing: {
    en: 'file missing on disk',
    es: 'fichero ausente en disco'
  },
  'timed-out': {
    en: 'timed out after {seconds}s',
    es: 'agotó el tiempo tras {seconds}s'
  },
  'not-run': {
    en: 'could not be run: {reason}',
    es: 'no se pudo ejecutar: {reason}'
  },
  'killed-by': {
    en: 'killed by {signal}',
    es: 'terminado por {signal}'
  },
  'batch-escaped': {
    en: 'the tree changed during the parallel run: {count} path(s), not attributable to one selftest; run with SELFTEST_CONCURRENCY=1 to name it',
    es: 'el árbol cambió durante la corrida paralela: {count} ruta(s), no atribuibles a un selftest; correr con SELFTEST_CONCURRENCY=1 para nombrarlo'
  },
  escaped: {
    en: 'escaped its sandbox: {count} path(s) written outside its seams',
    es: 'se escapó de su sandbox: {count} ruta(s) escritas fuera de sus costuras'
  },
  'escape-home-created': {
    en: '{path} written in its sandbox home: a module bypassed the state seam (hook-state/locations.mjs)',
    es: '{path} escrito en el home de su sandbox: un módulo se saltó la costura de estado (hook-state/locations.mjs)'
  },
  'escape-home-removed': {
    en: '{path} removed from its sandbox home',
    es: '{path} borrado del home de su sandbox'
  },
  'escape-temp-created': {
    en: '{path} left behind in its private temp directory',
    es: '{path} quedó en su directorio temporal privado'
  },
  'escape-temp-removed': {
    en: '{path} removed: the selftest deleted its private temp directory',
    es: '{path} borrado: el selftest eliminó su directorio temporal privado'
  },
  'escape-tree-added': {
    en: '{path} added to the tree under test',
    es: '{path} añadido al árbol bajo prueba'
  },
  'escape-tree-changed': {
    en: '{path} changed in the tree under test',
    es: '{path} cambiado en el árbol bajo prueba'
  },
  'escape-tree-removed': {
    en: '{path} no longer differs from the index: the selftest reverted or staged it',
    es: '{path} ya no difiere del índice: el selftest lo revirtió o lo preparó'
  },
  'escape-checkout-added': {
    en: '{path} added to the main checkout of the worktree under test: the selftest wrote outside its own tree',
    es: '{path} añadido al checkout principal del worktree bajo prueba: el selftest escribió fuera de su propio árbol'
  },
  'escape-checkout-changed': {
    en: '{path} changed in the main checkout of the worktree under test: the selftest wrote outside its own tree',
    es: '{path} cambiado en el checkout principal del worktree bajo prueba: el selftest escribió fuera de su propio árbol'
  },
  'escape-checkout-removed': {
    en: '{path} no longer differs from the index of the main checkout of the worktree under test',
    es: '{path} ya no difiere del índice del checkout principal del worktree bajo prueba'
  },
  'tree-unreadable': {
    en: 'Cannot read git status of the tree {tree} around {selftest}: {reason}. Nothing after it was measured.',
    es: 'No se puede leer el git status del árbol {tree} en torno a {selftest}: {reason}. No se midió nada después.'
  }
};
