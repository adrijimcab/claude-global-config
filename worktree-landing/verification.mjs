/**
 * Runs the repository's single test command in the WORKTREE (`node selftest-runner/run.mjs --root
 * <worktree>`, the worktree's own copy) and returns its green summary, or throws the Refusal that carries
 * its exit and its red lines. A run cut short by the timeout measured nothing and never reads as green.
 *
 * @es Ejecuta la única orden de pruebas del repositorio en el WORKTREE (`node selftest-runner/run.mjs
 * --root <worktree>`, la copia del propio worktree) y devuelve su resumen en verde, o lanza el Refusal con
 * su salida y sus líneas en rojo. Una corrida cortada por el límite de tiempo no midió nada y nunca es verde.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { EXIT_REFUSED, EXIT_VERIFICATION_RED, Refusal } from './outcome.mjs';

/** Bound on one verification run. @es Límite de una corrida de verificación. */
export const VERIFICATION_TIMEOUT_MS = 60 * 60 * 1000;

/** The test command's entry point, relative to the repository root. @es Punto de entrada de la orden de pruebas. */
export const TEST_RUNNER = path.join('selftest-runner', 'run.mjs');

/** Output lines that are not a green selftest. @es Líneas de la salida que no son un selftest en verde. */
function redLinesOf(output) {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '' && !line.startsWith('GREEN '))
    .map((line) => `    ${line}`);
}

/**
 * @param {string} worktree
 * @param {{ timeoutMs?: number }} [options]
 * @returns {string} the runner's last line (its green summary)
 * @es Devuelve la última línea del runner (su resumen en verde).
 */
export function verifyWorktree(worktree, { timeoutMs = VERIFICATION_TIMEOUT_MS } = {}) {
  const runner = path.join(worktree, TEST_RUNNER);
  if (!existsSync(runner)) {
    throw new Refusal('test-command-missing', [
      `The worktree has no test command at ${runner}; nothing can be verified, so nothing lands. @es El worktree no tiene orden de pruebas en ${runner}; no se puede verificar nada, así que no aterriza nada.`,
    ]);
  }
  const run = spawnSync(process.execPath, [runner, '--root', worktree], {
    cwd: worktree,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.error?.code === 'ETIMEDOUT') {
    const seconds = Math.round(timeoutMs / 1000);
    throw new Refusal('verification-timed-out', [
      `The test command did not finish within ${seconds}s; a cut-short run measured nothing. @es La orden de pruebas no terminó en ${seconds}s; una corrida cortada no midió nada.`,
    ]);
  }
  if (run.status === 0) return output.trimEnd().split('\n').at(-1) ?? '';
  if (run.status === EXIT_VERIFICATION_RED) {
    throw new Refusal(
      'verification-red',
      [`The test command is RED in the worktree (exit 1); nothing lands. @es La orden de pruebas está en ROJO en el worktree (salida 1); no aterriza nada.`, ...redLinesOf(output)],
      EXIT_VERIFICATION_RED,
    );
  }
  const ended = run.status === null ? `signal ${run.signal}` : `exit ${run.status}`;
  const termino = run.status === null ? `señal ${run.signal}` : `salida ${run.status}`;
  throw new Refusal(
    'verification-not-measured',
    [`The test command ended with ${ended}, which is not a verdict; nothing lands. @es La orden de pruebas terminó con ${termino}, que no es un veredicto; no aterriza nada.`, ...redLinesOf(output)],
    EXIT_REFUSED,
  );
}
