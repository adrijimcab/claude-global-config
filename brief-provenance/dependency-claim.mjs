/**
 * The DECISION of the dependency-claim face: a `MEASURED:` claim that names a package the project depends
 * on must carry its own evidence (`dependency-evidence.mjs`): a source citation, the receipt of a run, or a
 * version cited from its manifest.
 *
 * WHY. A claim about how a dependency behaves at runtime ("Playwright closes its children on SIGTERM")
 * reached a brief as MEASURED while nobody had read Playwright; the installed source says the opposite,
 * and the worker's stand-in, modelled on the false claim, proved nothing about the real tool. Whether a
 * claim is TRUE is not decidable by a hook; whether a claim about an installed package carries its SOURCE
 * is. This checks presence of the evidence, never its truth, the same move as the marker check itself.
 *
 * WHAT IS READ, STATED.
 *   - The MEASURED heading line AND its continuation: the indented or bulleted lines that follow it, up to
 *     a blank line, an unindented line or the next marker. Each line is judged on its own, so the evidence
 *     sits on the line of the claim it supports.
 *   - A name is matched as a WHOLE token, scoped names included (`@playwright/test`), case-folded on both
 *     sides, so "Playwright" names `playwright` while `playwrightish` and `node_modules/playwright/lib/x.js`
 *     do not. A one-word code span (`` `playwright` ``) still names it: only a backticked COMMAND is a
 *     receipt, and a line carrying a receipt passes whole.
 *   - Names that are ordinary English words are never counted (`ENGLISH_WORDS`).
 * No regex (M5): literal character scans.
 *
 * @es La DECISIÓN de la cara de afirmaciones de dependencias: una afirmación `MEASURED:` que nombra un
 * paquete del proyecto debe llevar su propia evidencia: una cita de fuente, el recibo de una ejecución o
 * una versión citada de su manifiesto. Se lee la línea del marcador Y su continuación (líneas sangradas o
 * con viñeta hasta una línea en blanco, una línea sin sangría o el siguiente marcador), cada línea por su
 * cuenta. El nombre casa como token ENTERO, sin distinguir mayúsculas; un tramo de código de una palabra
 * sigue nombrándolo. Los nombres que son palabras corrientes del inglés no cuentan. Sin regex.
 */

import { carriesEvidence } from './dependency-evidence.mjs';
import { words, trimPeriods } from './line-words.mjs';
import { HYPOTHESIS_WORD, LETTERS, MEASURED_WORD, stripLead } from './provenance.mjs';

/** What separates the words of prose around a package name. @es Lo que separa las palabras alrededor de un nombre. */
const NAME_SEPARATORS = ' \t\r:,;()[]{}<>|"\'`=!?';

/**
 * Dependency names that are ordinary English words, so prose using the word is never read as naming the
 * package. SOURCE: the Judgment Day review of b7c4388..f3a322d (2026-10-19), whose two judges listed these
 * names as refusing plain prose ("run them concurrently", "a prettier layout", "ignore it").
 * @es Nombres de dependencia que son palabras corrientes del inglés. FUENTE: la revisión Judgment Day de
 * b7c4388..f3a322d (2026-10-19), cuyos dos jueces los listaron porque rechazaban prosa normal.
 */
const ENGLISH_WORDS = new Set(['ignore', 'concurrently', 'prettier', 'unified', 'glob', 'chalk', 'debug', 'ms', 'open']);

/** Whether a layout-stripped line heads `word` as a marker, not a longer word. @es Si la línea encabeza el marcador `word`. */
const headsMarker = (line, word) => line.startsWith(word) && !LETTERS.includes(line.slice(word.length).charAt(0));

/**
 * The lines of every MEASURED claim, layout stripped: each heading line, then its continuation lines.
 * @es Las líneas de cada afirmación MEASURED, sin maquetación: cada encabezado y sus líneas de continuación.
 */
export function claimLines(text) {
  const lines = [];
  let inClaim = false;

  for (const rawLine of text.split('\n')) {
    const line = stripLead(rawLine);

    if (headsMarker(line, MEASURED_WORD)) {
      lines.push(line);
      inClaim = true;
    } else {
      // A continuation carries leading layout and some content, and is no marker of its own.
      inClaim = inClaim && line !== rawLine && line.length > 0 && !headsMarker(line, HYPOTHESIS_WORD);

      if (inClaim) lines.push(line);
    }
  }

  return lines;
}

/**
 * Every MEASURED claim line that names a dependency without carrying its evidence.
 *
 * @returns `[{ line, packages }]` — empty when every such line carries evidence, or names no dependency.
 * @es Cada línea de afirmación MEASURED que nombra una dependencia sin llevar su evidencia.
 */
export function unsourcedDependencyClaims(text, names) {
  const folded = new Set([...names].map((name) => name.toLowerCase()));
  const claims = [];

  for (const line of claimLines(text)) {
    if (carriesEvidence(line)) continue;

    const packages = words(line, NAME_SEPARATORS)
      .map((word) => trimPeriods(word).toLowerCase())
      .filter((word) => folded.has(word) && !ENGLISH_WORDS.has(word));

    if (packages.length > 0) claims.push({ line, packages });
  }

  return claims;
}
