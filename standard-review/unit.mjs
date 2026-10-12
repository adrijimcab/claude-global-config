/**
 * What a work unit IS for the review: the committed range `base..HEAD` of a worktree, read through git. It owns
 * the tree hash a verdict is keyed by (`HEAD^{tree}`: any change to the content changes it), the changed files,
 * the diff text, and the two refusals that come before any model is asked: a worktree with uncommitted work
 * (the review would judge something other than what lands) and a diff too large to be read whole.
 *
 * WHY A SIZE LIMIT. The reviewer must see the whole diff in one prompt to judge it: a diff cut at the model's
 * limit would be judged by its first part and pass its last. 60000 bytes (about 15000 tokens) is a deliberate
 * ceiling, not a measured one: it is several times the ODD work-unit budget of 400 lines, so a unit inside the
 * budget never meets it, and a unit beyond it is the signal to split it into reviewable commits.
 *
 * @es Qué ES una unidad de trabajo para la revisión: el rango confirmado `base..HEAD` de un worktree, leído con
 * git. Posee el hash del árbol por el que se indexa un veredicto (`HEAD^{tree}`: cualquier cambio de contenido lo
 * cambia), los ficheros cambiados, el texto del diff y los dos rechazos que van antes de consultar un modelo: un
 * worktree con trabajo sin confirmar (la revisión juzgaría algo distinto de lo que aterriza) y un diff
 * demasiado grande para leerse entero. POR QUÉ UN LÍMITE: el revisor debe ver el diff completo en un prompt; uno
 * cortado se juzgaría por su primera parte y pasaría su última. 60000 bytes (unos 15000 tokens) es un techo
 * deliberado, no medido: es varias veces el presupuesto de 400 líneas de una unidad ODD, así que una unidad
 * dentro del presupuesto nunca lo alcanza y una que lo supera debe dividirse en commits revisables.
 */

import { entriesOf, gitOutput } from '../worktree-landing/git.mjs';

/** The largest diff the review reads. @es El mayor diff que lee la revisión. */
export const MAX_DIFF_BYTES = 60_000;

/** The tree hash of the worktree's HEAD: the key of a verdict. @es El hash del árbol del HEAD del worktree: la clave de un veredicto. */
export const treeOf = (worktree) => gitOutput(worktree, ['rev-parse', 'HEAD^{tree}']).trim();

/**
 * @param {{ worktree: string, base: string }} inputs
 * @returns {{ tree: string, base: string, files: string[], diff: string, bytes: number }}
 * @es Devuelve la unidad; lanza un error bilingüe si no se puede revisar.
 */
export function unitOf({ worktree, base }) {
  if (base.startsWith('-')) throw new Error(`The base ${base} is not a ref. @es La base ${base} no es una ref.`);
  const baseCommit = gitOutput(worktree, ['rev-parse', '--verify', `${base}^{commit}`]).trim();

  if (gitOutput(worktree, ['status', '--porcelain', '--untracked-files=all']).trim() !== '') {
    throw new Error(`The worktree has uncommitted work; commit it first, the review judges what lands. @es El worktree tiene trabajo sin confirmar; confírmalo antes, la revisión juzga lo que aterriza.`);
  }
  const range = `${baseCommit}..HEAD`;
  const files = entriesOf(gitOutput(worktree, ['diff', '--name-only', '-z', range]));

  if (files.length === 0) throw new Error(`The range ${range} changes nothing; there is no unit to review. @es El rango ${range} no cambia nada; no hay unidad que revisar.`);
  const diff = gitOutput(worktree, ['diff', '--no-color', '--no-ext-diff', '-U5', range]);
  const bytes = Buffer.byteLength(diff);

  if (bytes > MAX_DIFF_BYTES) {
    throw new Error(
      `The diff is ${bytes} bytes, over the ${MAX_DIFF_BYTES} the reviewer can read whole; split the unit into smaller commits (an ODD work unit stays near 400 lines). @es El diff pesa ${bytes} bytes, más de los ${MAX_DIFF_BYTES} que el revisor puede leer entero; divide la unidad en commits más pequeños (una unidad ODD ronda las 400 líneas).`,
    );
  }

  return { tree: treeOf(worktree), base: baseCommit, files, diff, bytes };
}
