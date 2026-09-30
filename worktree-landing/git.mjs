/**
 * Runs one git command with a bounded wait and never a prompt, so no landing step can hang on the network
 * or on a credential dialog.
 *
 * @es Ejecuta una orden de git con una espera acotada y sin ningún diálogo, para que ningún paso del
 * aterrizaje pueda quedarse colgado en la red ni en una petición de credenciales.
 */

import { spawnSync } from 'node:child_process';

/** Default bound for one git command. @es Límite por defecto de una orden de git. */
export const GIT_TIMEOUT_MS = 5 * 60 * 1000;

/** Raised when git cannot give the answer a landing step needs. @es Se lanza cuando git no da la respuesta que un paso necesita. */
export class GitFailure extends Error {}

/**
 * Runs `git -C <cwd> <args>` and returns what it did; the caller decides what a non-zero status means.
 * @es Ejecuta `git -C <cwd> <args>` y devuelve lo que hizo; quien llama decide qué significa un estado no cero.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ input?: string, timeoutMs?: number }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string, timedOut: boolean }}
 */
export function git(cwd, args, { input, timeoutMs = GIT_TIMEOUT_MS } = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    input,
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${result.error ? result.error.message : ''}`,
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

/**
 * Runs git and returns its stdout, or throws a bilingual GitFailure naming the command and its error.
 * @es Ejecuta git y devuelve su stdout, o lanza un GitFailure bilingüe con la orden y su error.
 */
export function gitOutput(cwd, args, options) {
  const result = git(cwd, args, options);
  if (result.status === 0) return result.stdout;
  const what = `git -C "${cwd}" ${args.join(' ')}`;
  const why = result.timedOut ? 'timed out' : `exit ${result.status}: ${result.stderr.trim()}`;
  const porque = result.timedOut ? 'agotó el tiempo' : `salida ${result.status}: ${result.stderr.trim()}`;
  throw new GitFailure(`${what} failed (${why}). @es ${what} falló (${porque}).`);
}

/** NUL-separated git output as entries. @es Salida de git separada por NUL, como entradas. */
export function entriesOf(output) {
  return output.split('\0').filter((entry) => entry !== '');
}
