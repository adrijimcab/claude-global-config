/**
 * The parity verdict of a project's two contracts, as data, so the hook and any future command cannot
 * disagree about what drift is.
 *
 * `status`:
 * - `absent`: the project declared nothing (`anchors-file.mjs`) and has no contract of its own
 *   (`contract-presence.mjs`); it is not checked.
 * - `undeclared`: the project has a contract of its own and declared nothing, so nothing guards its two contracts.
 * - `invalid`: it declared something unusable; `problems` says what.
 * - `skipped`: a side has no contract file on this machine (`absentSides` names it): gitignored files exist
 *   only where their maintainer works. It is never reported as parity, because nothing was compared.
 * - `parity` / `drift`: every anchor is carried by both sides, or `missingIn<Side>` lists those that are not.
 *   `embeddedIn<Side>` is the subset of the missing ones the side holds only inside a longer token (the `M10`
 *   near miss), so a reader is told the anchor is almost there rather than that it vanished.
 *
 * @es El veredicto de paridad de los dos contratos de un proyecto, como dato. `absent`: no declaró nada y no tiene
 * contrato propio, no se comprueba. `undeclared`: tiene contrato propio y no declaró nada, así que nada protege
 * sus dos contratos. `invalid`: declaró algo inservible. `skipped`: a un lado le falta el fichero en esta máquina; nunca
 * se informa como paridad porque no se comparó nada. `parity`/`drift`: cada anchor lo llevan ambos lados, o
 * `missingIn<Lado>` lista los que no; `embeddedIn<Lado>` es el subconjunto que el lado solo tiene dentro de un
 * token más largo (el casi-acierto `M10`).
 */

import { anchorPresence } from './anchor-match.mjs';
import { readAnchors } from './anchors-file.mjs';
import { ownsContract } from './contract-presence.mjs';
import { contractText } from './contract-text.mjs';

/** The anchors a text does not carry as a token, and which of them it holds only embedded. @es Los anchors que un texto no lleva como token y cuáles tiene solo embebidos. */
function sideReport(text, anchors) {
  const presence = anchors.map((anchor) => ({ anchor, presence: anchorPresence(text, anchor) }));

  return {
    missing: presence.filter((entry) => entry.presence !== 'token').map((entry) => entry.anchor),
    embedded: presence.filter((entry) => entry.presence === 'embedded').map((entry) => entry.anchor)
  };
}

/**
 * @param {string} root the project root / la raíz del proyecto
 * @returns {object} the verdict described above / el veredicto descrito arriba
 */
export function contractParity(root) {
  const declaration = readAnchors(root);

  if (declaration.status === 'absent') return { status: ownsContract(root) ? 'undeclared' : 'absent' };
  if (declaration.status === 'invalid') return { status: 'invalid', problems: declaration.problems };

  const english = contractText(root, declaration.english);
  const spanish = contractText(root, declaration.spanish);
  const absentSides = [english.present === 0 ? 'english' : undefined, spanish.present === 0 ? 'spanish' : undefined].filter((side) => side !== undefined);

  if (absentSides.length > 0) return { status: 'skipped', absentSides };

  const inEnglish = sideReport(english.text, declaration.anchors);
  const inSpanish = sideReport(spanish.text, declaration.anchors);
  const drifted = inEnglish.missing.length > 0 || inSpanish.missing.length > 0;

  return {
    status: drifted ? 'drift' : 'parity',
    anchorCount: declaration.anchors.length,
    missingInEnglish: inEnglish.missing,
    embeddedInEnglish: inEnglish.embedded,
    missingInSpanish: inSpanish.missing,
    embeddedInSpanish: inSpanish.embedded
  };
}
