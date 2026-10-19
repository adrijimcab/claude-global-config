/**
 * The lexical PREFILTER of the dependency-claim face: which MEASURED claims could be a claim about how an
 * installed dependency BEHAVES, and so need the claim judge (`claim-judge.mjs`). It is broad on purpose and
 * decides only the two cases a scan can decide: a claim that names no dependency of the project, and a claim
 * that cites a source location (`source-citation.mjs`), are both allowed with no model call. Everything else is
 * a CANDIDATE for the judge: whether a sentence asserts runtime behaviour or reports a run, a version or plain
 * prose is meaning, and every phrase-based test of meaning was bypassed by a single token (a review measured
 * "… and they exit 0", a backticked claim and a version beside package.json each reopening the incident).
 *
 * WHY. A claim about how a dependency behaves at runtime ("Playwright closes its children on SIGTERM")
 * reached a brief as MEASURED while nobody had read Playwright; the installed source says the opposite, and the
 * worker's stand-in, modelled on the false claim, proved nothing about the real tool.
 *
 * WHAT IS A CLAIM. A MEASURED heading line and its continuation (the indented or bulleted lines that follow it,
 * up to a blank line, an unindented line or the next marker) form ONE claim unit, judged whole: a heading that
 * names the dependency and a bullet that carries the evidence are one claim. A name is matched as a WHOLE token,
 * scoped names included (`@playwright/test`), case-folded on both sides. No regex (M5): literal scans.
 *
 * @es El PREFILTRO léxico de la cara de dependencias: qué afirmaciones MEASURED podrían afirmar cómo SE COMPORTA
 * una dependencia instalada y necesitan al juez (`claim-judge.mjs`). Es amplio a propósito y solo decide lo que
 * un recorrido puede decidir: una afirmación que no nombra ninguna dependencia y una que cita una ubicación de
 * código pasan sin llamar al modelo. Lo demás es CANDIDATO: si una frase afirma un comportamiento o informa de
 * una ejecución, una versión o prosa es significado, y cada prueba por frases se esquivó con un solo token. Una
 * UNIDAD de afirmación es el encabezado MEASURED y su continuación (líneas sangradas o con viñeta hasta una línea
 * en blanco, una sin sangría o el siguiente marcador), juzgada entera. El nombre casa como token ENTERO, sin
 * distinguir mayúsculas. Sin regex.
 */

import { words, trimPeriods } from './line-words.mjs';
import { HYPOTHESIS_WORD, LETTERS, MEASURED_WORD, stripLead } from './provenance.mjs';
import { citesSource } from './source-citation.mjs';

/** What separates the words of prose around a package name. @es Lo que separa las palabras alrededor de un nombre. */
const NAME_SEPARATORS = ' \t\r\n:,;()[]{}<>|"\'`=!?';

/** Whether a layout-stripped line heads `word` as a marker, not a longer word. @es Si la línea encabeza el marcador `word`. */
const headsMarker = (line, word) => line.startsWith(word) && !LETTERS.includes(line.slice(word.length).charAt(0));

/**
 * Every MEASURED claim unit, as its layout-stripped lines joined by newlines: the heading, then its continuation.
 * @es Cada unidad de afirmación MEASURED: el encabezado y su continuación, sin maquetación, unidos por saltos.
 */
export function claimUnits(text) {
  const units = [];
  let current;

  for (const rawLine of text.split('\n')) {
    const line = stripLead(rawLine);

    if (headsMarker(line, MEASURED_WORD)) {
      current = [line];
      units.push(current);
    } else if (current !== undefined && line !== rawLine && line.length > 0 && !headsMarker(line, HYPOTHESIS_WORD)) {
      // A continuation carries leading layout and some content, and is no marker of its own.
      current.push(line);
    } else {
      current = undefined;
    }
  }

  return units.map((lines) => lines.join('\n'));
}

/** The dependencies a unit names, folded, each once. @es Las dependencias que nombra una unidad, una vez cada una. */
function namedPackages(unit, folded) {
  return [...new Set(words(unit, NAME_SEPARATORS).map((word) => trimPeriods(word).toLowerCase()).filter((word) => folded.has(word)))];
}

/**
 * The claim units the judge must read: each names a dependency and cites no source location.
 *
 * @returns `[{ unit, packages }]` — empty when no unit needs the judge.
 * @es Las unidades que debe leer el juez: cada una nombra una dependencia y no cita ubicación de código.
 */
export function candidateClaims(text, names) {
  const folded = new Set([...names].map((name) => name.toLowerCase()));
  const candidates = [];

  for (const unit of claimUnits(text)) {
    const packages = namedPackages(unit, folded);

    if (packages.length > 0 && !citesSource(unit)) candidates.push({ unit, packages });
  }

  return candidates;
}
