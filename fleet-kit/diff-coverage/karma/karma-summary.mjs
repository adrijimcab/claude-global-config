/**
 * Whether a Karma run is complete enough to trust its coverage. A grade computed from an incomplete run
 * is worse than no grade: lines read uncovered because their tests never ran, or a green reads over
 * specs that were silently skipped.
 *
 * Karma's `progress` reporter ends with `Executed <x> of <y> <status…>` (it rewrites that line with `\r`
 * while running, so the LAST occurrence is the final one). Complete means: at least one spec, every spec
 * executed (`x === y`, so any `skipped`, focused `fit`, or disconnect fails it), `SUCCESS`, and no
 * `FAILED`, `ERROR` or `DISCONNECTED`.
 *
 * @es Si una corrida de Karma es lo bastante completa para confiar en su cobertura. Karma termina con
 * `Executed <x> of <y> <estado…>`; completa significa al menos un spec, todos ejecutados (`x === y`, así
 * que cualquier `skipped`, `fit` o desconexión la invalida), `SUCCESS`, y ningún `FAILED`/`ERROR`/`DISCONNECTED`.
 */

const EXECUTED_MARKER = 'Executed ';
const FAILURE_WORDS = ['FAILED', 'ERROR', 'DISCONNECTED'];

/**
 * The final `Executed x of y …` line of `text`, parsed, or `undefined` when Karma never printed one.
 * @returns `{ executed, total, status }`.
 * @es La última línea `Executed x of y …`, parseada, o `undefined`.
 */
export function parseKarmaSummary(text) {
  const lines = text.split('\r').join('\n').split('\n');
  const last = lines.findLast((line) => line.includes(EXECUTED_MARKER));

  if (last === undefined) return undefined;

  const [executed, of, total, ...rest] = last.slice(last.indexOf(EXECUTED_MARKER) + EXECUTED_MARKER.length).split(' ');

  if (of !== 'of') return undefined;

  return { executed: Number(executed), total: Number(total), status: rest.join(' ') };
}

/**
 * @param run `{ text, exitCode, coverageFileExists }` of one Karma run.
 * @returns `{ ok: true }` or `{ ok: false, reason }`.
 * @es Decide si la corrida es fiable, o por qué no.
 */
export function decideKarmaRun({ text, exitCode, coverageFileExists }) {
  const summary = parseKarmaSummary(text);

  if (summary === undefined) return { ok: false, reason: 'Karma printed no "Executed x of y" summary — the run never reached the browser' };
  if (summary.total === 0) return { ok: false, reason: 'Karma found zero specs' };
  if (summary.executed !== summary.total) return { ok: false, reason: `Karma executed ${summary.executed} of ${summary.total} specs (skipped, focused or aborted) — an incomplete run grades nothing` };

  const failure = FAILURE_WORDS.find((word) => summary.status.includes(word));

  if (failure !== undefined) return { ok: false, reason: `the run ended ${failure}: ${summary.status}` };
  if (!summary.status.includes('SUCCESS')) return { ok: false, reason: `the run did not report SUCCESS: ${summary.status}` };
  if (exitCode !== 0) return { ok: false, reason: `ng test exited ${String(exitCode)} after a SUCCESS summary` };
  if (!coverageFileExists) return { ok: false, reason: 'no lcov.info was produced' };

  return { ok: true };
}
