/**
 * Whether gentle-ai reviews may run on this machine, read through gentle-ai's own
 * `review mode status --json`, never from its state files: the CLI owns the precedence.
 *
 * Only the GLOBAL source is read. In gentle-ai v2.9.1 (internal/reviewtransaction/rdd_mode.go,
 * rddModeStatus) the effective mode is `on` only when the global source is `on`; a clone-local
 * override can only force `off`. So "global is not on" means reviews are off in every clone, and
 * "global is on" means some clone may review, which needs the contract loaded.
 *
 * @es Si las revisiones de gentle-ai pueden correr en esta máquina, leído con el propio
 * `review mode status --json` de gentle-ai, nunca de sus ficheros de estado: el CLI es dueño de la
 * precedencia. Solo se lee la fuente GLOBAL: en gentle-ai v2.9.1 el modo efectivo es `on` solo cuando
 * la global es `on`, y un override local de un clon solo puede forzar `off`. Así, «global no es on»
 * significa revisiones apagadas en todo clon, y «global es on» significa que algún clon puede revisar,
 * lo que necesita el contrato cargado.
 */
import { runGentleAi } from './gentle-ai-cli.mjs';

const MODE_SCHEMA = 'gentle-ai.review-mode/v1';
const STATUS_SCHEMA = 'gentle-ai.rdd-mode-status/v1';

/**
 * @param {{ gentleAi: string[] }} context
 * @returns {{ reviewsMayRun: boolean } | { unreadable: string }}
 */
export function readReviewMode(context) {
  const run = runGentleAi(context, ['review', 'mode', 'status', '--json']);
  if (!run.ok) return { unreadable: run.reason };
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    return { unreadable: `review mode status did not print JSON: ${run.stdout.trim().slice(0, 120)} @es review mode status no imprimió JSON` };
  }
  if (report?.schema !== MODE_SCHEMA || report.status?.schema !== STATUS_SCHEMA) {
    return { unreadable: `review mode status answered schemas "${report?.schema}" / "${report?.status?.schema}" @es review mode status respondió esquemas inesperados` };
  }
  return { reviewsMayRun: report.status.global === 'on' };
}
