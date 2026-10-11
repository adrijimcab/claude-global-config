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
  'nothing-found': {
    en: 'No selftest found in {root}; nothing was measured.',
    es: 'No se encontró ningún selftest en {root}; no se midió nada.'
  },
  usage: {
    en: 'Usage: node run.mjs [--root <dir>]. No filter or skip option exists.',
    es: 'Uso: node run.mjs [--root <dir>]. No existe ninguna opción de filtro ni de salto.'
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
  'tree-unreadable': {
    en: 'Cannot read git status of the tree {tree} around {selftest}: {reason}. Nothing after it was measured.',
    es: 'No se puede leer el git status del árbol {tree} en torno a {selftest}: {reason}. No se midió nada después.'
  }
};
