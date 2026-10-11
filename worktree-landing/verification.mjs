/**
 * Runs the worktree's test command (the one `test-command.mjs` resolves: the project's declared unit suite, else
 * the repository's selftest runner) in the WORKTREE and returns its green summary, or throws the Refusal that
 * carries its exit and its red lines. A run cut short by the timeout measured nothing and never reads as green.
 *
 * @es Ejecuta la orden de pruebas del worktree (la que resuelve `test-command.mjs`: la suite unitaria declarada
 * del proyecto, o el runner de selftests del repositorio) en el WORKTREE y devuelve su resumen en verde, o lanza el
 * Refusal con su salida y sus líneas en rojo. Una corrida cortada por el límite de tiempo no midió nada y nunca es verde.
 */

import { spawnSync } from 'node:child_process';

import { EXIT_REFUSED, EXIT_VERIFICATION_RED, Refusal } from './outcome.mjs';
import { testCommandOf } from './test-command.mjs';

/** Bound on one verification run. @es Límite de una corrida de verificación. */
export const VERIFICATION_TIMEOUT_MS = 60 * 60 * 1000;

/** How many trailing lines of a declared suite's output a red report carries. @es Cuántas líneas finales de la salida de una suite declarada lleva un informe en rojo. */
const SUITE_TAIL_LINES = 40;

/** Output lines that are not a green selftest. @es Líneas de la salida que no son un selftest en verde. */
function runnerRedLinesOf(output) {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '' && !line.startsWith('GREEN '))
    .map((line) => `    ${line}`);
}

/** The last lines of a declared suite's output, where its failures are summarised. @es Las últimas líneas de la salida de una suite declarada. */
function suiteTailOf(output) {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .slice(-SUITE_TAIL_LINES)
    .map((line) => `    ${line}`);
}

/**
 * @param {string} worktree
 * @param {{ main: string, timeoutMs?: number }} options
 * @returns {string} the command and its last line (its green summary)
 * @es Devuelve la orden y su última línea (su resumen en verde).
 */
export function verifyWorktree(worktree, { main, timeoutMs = VERIFICATION_TIMEOUT_MS }) {
  const test = testCommandOf({ worktree, main });
  const run = spawnSync(test.command, test.args, {
    cwd: test.cwd,
    shell: test.shell,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const redLines = test.anyNonZeroIsRed ? suiteTailOf(output) : runnerRedLinesOf(output);
  if (run.error?.code === 'ETIMEDOUT') {
    const seconds = Math.round(timeoutMs / 1000);
    throw new Refusal('verification-timed-out', [
      `The test command ${test.label} did not finish within ${seconds}s; a cut-short run measured nothing. @es La orden de pruebas ${test.label} no terminó en ${seconds}s; una corrida cortada no midió nada.`,
    ]);
  }
  if (run.status === 0) return `${test.label}: ${output.trimEnd().split('\n').at(-1) ?? ''}`;
  if (run.status === EXIT_VERIFICATION_RED || (test.anyNonZeroIsRed && run.status !== null)) {
    throw new Refusal(
      'verification-red',
      [`The test command ${test.label} is RED in the worktree (exit ${run.status}); nothing lands. @es La orden de pruebas ${test.label} está en ROJO en el worktree (salida ${run.status}); no aterriza nada.`, ...redLines],
      EXIT_VERIFICATION_RED,
    );
  }
  const ended = run.status === null ? `signal ${run.signal}` : `exit ${run.status}`;
  const termino = run.status === null ? `señal ${run.signal}` : `salida ${run.status}`;
  throw new Refusal(
    'verification-not-measured',
    [`The test command ${test.label} ended with ${ended}, which is not a verdict; nothing lands. @es La orden de pruebas ${test.label} terminó con ${termino}, que no es un veredicto; no aterriza nada.`, ...redLines],
    EXIT_REFUSED,
  );
}
