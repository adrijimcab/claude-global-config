/**
 * Consultar la deriva del overlay ejecutando su `check.mjs --json` en un proceso aparte.
 *
 * Devuelve `{ exitCode, results }` cuando el check respondió, o `{ failure }` con el motivo cuando no
 * pudo (no terminó a tiempo, salida que no es su JSON). Un fallo NUNCA se convierte en "sin deriva":
 * esa traducción es exactamente la que dejaría pasar un sync a ciegas.
 */
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

export const DEFAULT_CHECK_SCRIPT = path.join(homedir(), '.claude', 'gentle-ai-overlay', 'check.mjs');
const DEFAULT_TIMEOUT_MS = 25_000;

/** @returns {{ exitCode: number, results: object[] } | { failure: string }} */
export function runOverlayCheck(checkScript = DEFAULT_CHECK_SCRIPT, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const run = spawnSync(process.execPath, [checkScript, '--json'], { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  // Sin código de salida no hay veredicto: el proceso no arrancó o se lo mató (p. ej. por tiempo).
  if (run.status === null) return { failure: `${checkScript} did not complete (${run.error?.message ?? `killed by ${run.signal}`})` };
  try {
    const report = JSON.parse(run.stdout);
    if (!Array.isArray(report.results)) return { failure: `${checkScript} printed no results array` };
    return { exitCode: run.status, results: report.results };
  } catch {
    return { failure: `${checkScript} exited ${run.status} without its JSON report: ${`${run.stdout}${run.stderr}`.trim().slice(0, 200)}` };
  }
}
