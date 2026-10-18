/**
 * The DECISION of the dependency-claim face: a `MEASURED:` line that names a package the project depends
 * on must cite where the claim was read — a `path:line` token, or a path under `node_modules/`.
 *
 * WHY. A claim about how a dependency behaves at runtime ("Playwright closes its children on SIGTERM")
 * reached a brief as MEASURED while nobody had read Playwright; the installed source says the opposite,
 * and the worker's stand-in, modelled on the false claim, proved nothing about the real tool. Whether a
 * claim is TRUE is not decidable by a hook; whether a claim about an installed package carries its SOURCE
 * is. This checks presence of the citation, never its truth, the same move as the marker check itself.
 *
 * SCOPE, STATED. Only the MEASURED line itself is read (the line that heads the marker), not the bullets
 * that may follow it; a name is matched as a WHOLE token, scoped names included (`@playwright/test`), so
 * `playwrightish` and `node_modules/playwright/lib/x.js` do not count as naming `playwright`. No regex
 * (M5): literal character scans.
 *
 * @es La DECISIÓN de la cara de afirmaciones de dependencias: una línea `MEASURED:` que nombra un paquete
 * del que depende el proyecto debe citar dónde se leyó: un token `ruta:línea` o una ruta bajo
 * `node_modules/`. Se comprueba la PRESENCIA de la cita, nunca su verdad. ALCANCE: solo la línea del
 * marcador, no las viñetas siguientes; el nombre casa como token ENTERO (con scope incluido). Sin regex.
 */

import { LETTERS, MEASURED_WORD, stripLead } from './provenance.mjs';

const DIGITS = '0123456789';

/** What separates the words of prose around a package name. @es Lo que separa las palabras alrededor de un nombre. */
const NAME_SEPARATORS = ' \t\r:,;()[]{}<>|"\'`=!?';

/** What separates the words of a citation; the colon stays inside, it joins path and line. @es Separadores de una cita; el dos puntos queda dentro. */
const CITATION_SEPARATORS = ' \t\r,;()[]{}<>|"\'`';

const words = (line, separators) => {
  const found = [];
  let current = '';

  for (const character of line) {
    if (separators.includes(character)) {
      if (current.length > 0) found.push(current);

      current = '';
    } else {
      current += character;
    }
  }

  if (current.length > 0) found.push(current);

  return found;
};

const trimPeriods = (word) => {
  let trimmed = word;

  while (trimmed.endsWith('.')) trimmed = trimmed.slice(0, -1);

  return trimmed;
};

/** Whether `text` is one or more digits, or a range of them. @es Si `text` es un número de línea o un rango. */
function isLineRef(text) {
  const parts = text.split('-');

  return parts.length <= 2 && parts.every((part) => part.length > 0 && [...part].every((character) => DIGITS.includes(character)));
}

/** Whether a path has a `/` or a letters-only extension, so `1.58` is not a file. @es Si una ruta tiene `/` o extensión de letras. */
function looksLikePath(text) {
  if (text.includes('/')) return true;

  const dot = text.lastIndexOf('.');
  const extension = dot >= 0 ? text.slice(dot + 1) : '';

  return extension.length > 0 && [...extension].every((character) => LETTERS.includes(character));
}

/** Whether the line cites a source location. @es Si la línea cita una ubicación de código. */
export function citesSource(line) {
  if (line.split('\\').join('/').includes('node_modules/')) return true;

  return words(line, CITATION_SEPARATORS).some((word) => {
    // A word with no colon (index -1) yields its whole text as the "reference" and all but its last
    // character as the "path"; a reference is only digits and a hyphen, which no path can be, so it fails.
    const colon = word.lastIndexOf(':');
    const reference = trimPeriods(word.slice(colon + 1));

    return isLineRef(reference) && looksLikePath(word.slice(0, colon));
  });
}

/** The lines that head a MEASURED marker, layout stripped. @es Las líneas que encabezan un marcador MEASURED. */
export function measuredLines(text) {
  const lines = [];

  for (const rawLine of text.split('\n')) {
    const line = stripLead(rawLine);

    if (!line.startsWith(MEASURED_WORD)) continue;

    // A longer word (`MEASUREDLY`) is not the marker; a bare marker alone on its line names nothing.
    if (LETTERS.includes(line.slice(MEASURED_WORD.length).charAt(0))) continue;

    lines.push(line);
  }

  return lines;
}

/**
 * Every MEASURED line that names a dependency without citing a source.
 *
 * @returns `[{ line, packages }]` — empty when every such line cites, or names no dependency.
 * @es Cada línea MEASURED que nombra una dependencia sin citar fuente.
 */
export function unsourcedDependencyClaims(text, names) {
  const claims = [];

  for (const line of measuredLines(text)) {
    const packages = words(line, NAME_SEPARATORS).map(trimPeriods).filter((word) => names.has(word));

    if (packages.length > 0 && !citesSource(line)) claims.push({ line, packages });
  }

  return claims;
}
