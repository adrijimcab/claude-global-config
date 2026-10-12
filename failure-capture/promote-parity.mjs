/**
 * What a project's contract parity says about a promotion, read from the SHARED engine
 * (`../agent-contract-parity/`) and nothing else: the project declares its anchors in
 * `.claude/agent-contract/anchors.json`, and the same verdict that guards a delegation guards a promotion.
 *
 * Replaces the per-project `parityGate` script, which every project had to keep in step with its own
 * contracts by hand. A project with no declaration is not checked; a project WITH one is held to it.
 *
 * `{ declared: false }` when the project declares nothing. Otherwise `{ declared: true, file, anchors,
 * refusal, absentSides }`: `file` is the declaration, `anchors` its tokens (`undefined` when it is invalid),
 * `refusal` the engine's own bilingual text for drift or an invalid declaration (`undefined` when there is
 * none), and `absentSides` the sides with no contract file on this machine, which means nothing was compared.
 *
 * @es Lo que la paridad de contrato de un proyecto dice sobre una promoción, leído del motor COMPARTIDO
 * (`../agent-contract-parity/`) y de nada más: el proyecto declara sus anchors en
 * `.claude/agent-contract/anchors.json` y el mismo veredicto que protege una delegación protege una promoción.
 * Sustituye al script `parityGate` por proyecto. Un proyecto sin declaración no se comprueba; uno CON
 * declaración se atiene a ella.
 */

import path from 'node:path';

import { ANCHORS_FILE, readAnchors } from '../agent-contract-parity/anchors-file.mjs';
import { contractParity } from '../agent-contract-parity/parity.mjs';
import { refusalReason } from '../agent-contract-parity/refusal-text.mjs';

/**
 * @param {string} root the project root / la raíz del proyecto
 * @returns {{ declared: boolean, file?: string, anchors?: string[], refusal?: string, absentSides: string[] }}
 */
export function promotionParity(root) {
  const declaration = readAnchors(root);

  if (declaration.status === 'absent') return { declared: false, absentSides: [] };

  const verdict = contractParity(root);

  return {
    declared: true,
    file: path.join(root, ...ANCHORS_FILE.split('/')),
    anchors: declaration.status === 'ok' ? declaration.anchors : undefined,
    refusal: refusalReason(verdict),
    absentSides: verdict.status === 'skipped' ? verdict.absentSides : []
  };
}
