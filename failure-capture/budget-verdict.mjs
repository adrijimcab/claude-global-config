/**
 * Whether a measured loaded instruction set fits its ceiling: `budgetVerdict` takes the `loadedSet` result and
 * the ceilings and answers within or over, which ceiling decided, the margin, both totals, the files by weight
 * and any file over the harness per-file limit. Pure: no file, no command, no printing.
 *
 * The decision is made on RAW length, an upper bound of the harness's count under any stripping rule, so a
 * set within the ceiling on raw holds under the harness too; the harness-counted figure is reported beside it.
 * The stricter of the global and the project ceiling applies, and a looser project one never relaxes the
 * global one. A file over the per-file limit is reported, never decided on.
 *
 * @es Si un conjunto de instrucciones cargado y medido cabe en su techo: `budgetVerdict` recibe el resultado
 * de `loadedSet` y los techos, y responde dentro o sobre, qué techo decidió, el margen, ambos totales, los
 * ficheros por peso y cualquier fichero sobre el límite por fichero del harness. Pura: sin ficheros, sin
 * comandos, sin imprimir. Se decide por longitud BRUTA, cota superior del recuento del harness bajo cualquier
 * regla de recorte, así que un conjunto dentro del techo en bruto también cabe para el harness; la cifra
 * contada por el harness se informa al lado. Aplica el más estricto entre el techo global y el del proyecto;
 * uno más laxo nunca relaja el global. Un fichero sobre el límite por fichero se informa, nunca decide.
 */

import { countsTowardTotal, harnessLimits } from './harness-count.mjs';

/** The global ceiling on the loaded set: the harness's 150,000 minus 3,000 of headroom. @es El techo global: los 150.000 del harness menos 3.000 de holgura. */
export const GLOBAL_CEILING = 147_000;

const byWeightThenPath = (left, right) => right.raw - left.raw || left.path.localeCompare(right.path);

/**
 * The verdict for `loaded` (the `loadedSet` result) against `globalCeiling` and the optional `projectCeiling`;
 * `contextTokens` sizes the per-file limit (the harness default when absent).
 * @es El veredicto de `loaded` frente a `globalCeiling` y al opcional `projectCeiling`; `contextTokens` fija el límite por fichero.
 */
export function budgetVerdict({ loaded, projectCeiling, globalCeiling = GLOBAL_CEILING, contextTokens }) {
  const projectDecides = projectCeiling !== undefined && projectCeiling < globalCeiling;
  const ceiling = projectDecides ? projectCeiling : globalCeiling;
  const limits = harnessLimits({ contextTokens });
  const files = loaded.files.map(({ path, raw, counted }) => ({ path, raw, counted })).sort(byWeightThenPath);

  return {
    status: loaded.rawTotal <= ceiling ? 'within' : 'over',
    source: projectDecides ? 'project' : 'global',
    ceiling,
    margin: ceiling - loaded.rawTotal,
    rawTotal: loaded.rawTotal,
    countedTotal: loaded.countedTotal,
    files,
    overPerFile: files.filter((file) => !countsTowardTotal(file.counted, limits)).map((file) => ({ path: file.path, counted: file.counted, limit: limits.perFile }))
  };
}
