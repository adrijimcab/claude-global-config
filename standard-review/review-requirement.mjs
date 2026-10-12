/**
 * The landing's requirement: the tree being landed must hold a recorded PASS from the standard review. It
 * answers `{ ok: true, tree }`, or `{ ok: false, reason, lines }` with a bilingual explanation: `review-missing`
 * names the command to run, `review-failed` lists the findings of the recorded FAIL. It decides on the tree
 * hash alone, so a verdict never covers content other than the one it reviewed. One function, called by
 * every landing (`worktree-landing/land.mjs`, and a project's own integration).
 *
 * @es El requisito del aterrizaje: el árbol que aterriza debe tener un PASS registrado de la revisión contra el
 * estándar. Contesta `{ ok: true, tree }`, o `{ ok: false, reason, lines }` con una explicación bilingüe:
 * `review-missing` nombra la orden a ejecutar, `review-failed` lista los hallazgos del FAIL registrado. Decide
 * solo por el hash del árbol, así que un veredicto nunca cubre contenido distinto del que revisó. Una función,
 * llamada por todo aterrizaje (`land.mjs` y la integración propia de un proyecto).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { treeOf } from './unit.mjs';
import { verdictOf } from './verdict-store.mjs';

const REVIEW_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review.mjs');

/**
 * @param {{ worktree: string }} inputs
 * @returns {{ ok: true, tree: string } | { ok: false, reason: string, lines: string[] }}
 */
export function reviewRequirementOf({ worktree }) {
  const tree = treeOf(worktree);
  const recorded = verdictOf(tree);

  if (recorded?.verdict === 'pass') return { ok: true, tree };
  if (recorded === undefined) {
    return {
      ok: false,
      reason: 'review-missing',
      lines: [
        `Tree ${tree} has no recorded PASS from the standard review; run: node "${REVIEW_SCRIPT}" --worktree "${worktree}" --base <integration ref>. @es El árbol ${tree} no tiene un PASS registrado de la revisión contra el estándar; ejecuta: node "${REVIEW_SCRIPT}" --worktree "${worktree}" --base <ref de integración>.`,
      ],
    };
  }

  return {
    ok: false,
    reason: 'review-failed',
    lines: [
      `The standard review of tree ${tree} FAILED: ${recorded.summary}. Fix the findings, commit, and review again. @es La revisión contra el estándar del árbol ${tree} FALLÓ: ${recorded.summary}. Corrige los hallazgos, confirma y revisa de nuevo.`,
      ...recorded.findings.map((finding) => `    ${finding.file}:${finding.line} [standard item ${finding.standard}] ${finding.why}`),
    ],
  };
}
