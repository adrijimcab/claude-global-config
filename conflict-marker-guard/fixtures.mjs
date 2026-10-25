/**
 * THE DECLARED FIXTURES: the path prefixes whose files may carry conflict markers as DATA. They live in
 * `fixture-paths.json` beside this module, in the Claude home, so a change under review cannot widen its own
 * exemption; an absent file means the default, this guard's own fixtures. A malformed file also means the
 * default (the strict choice) and is REPORTED, so a typo never disables the guard silently.
 *
 * @es LOS FIXTURES DECLARADOS: los prefijos de ruta cuyos ficheros pueden llevar marcas de conflicto como DATO.
 * Viven en `fixture-paths.json`, junto a este módulo y en el home de Claude, así que un cambio en revisión no
 * puede ensanchar su propia exención; si falta el fichero rige el valor por defecto, los fixtures de esta
 * guardia. Un fichero mal formado también da el valor por defecto (lo estricto) y se INFORMA, para que un
 * error de tipeo no desactive la guardia en silencio.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The default: this guard's own selftest fixtures, relative to the repository root. @es Por defecto: los fixtures de esta guardia. */
export const DEFAULT_FIXTURE_PREFIXES = Object.freeze(['conflict-marker-guard/fixtures/']);

/** The declaration file. @es El fichero de declaración. */
export const FIXTURE_PATHS_FILE = path.join(import.meta.dirname, 'fixture-paths.json');

/**
 * @param file The declaration file (a test seam). @param read Replaces the file reader (a test seam).
 * @returns `{ prefixes, failure }` — `failure` is a one-line reason when the file exists but is unusable.
 * @es Los prefijos declarados; `failure` dice por qué un fichero existente no sirve.
 */
export function declaredFixturePrefixes(file = FIXTURE_PATHS_FILE, read = readFileSync) {
  let text;

  try {
    text = read(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { prefixes: [...DEFAULT_FIXTURE_PREFIXES] };

    return { prefixes: [...DEFAULT_FIXTURE_PREFIXES], failure: `fixture-paths.json unreadable (${error.code ?? error.message}); the default applies` };
  }

  try {
    const { prefixes } = JSON.parse(text);

    if (Array.isArray(prefixes) && prefixes.every((prefix) => typeof prefix === 'string' && prefix.endsWith('/') && !prefix.startsWith('/'))) return { prefixes };
  } catch {
    /* reported below */
  }

  return { prefixes: [...DEFAULT_FIXTURE_PREFIXES], failure: 'fixture-paths.json is not {"prefixes": ["dir/", ...]} with relative prefixes ending in "/"; the default applies' };
}
