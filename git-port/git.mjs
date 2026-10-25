/**
 * The one way kit modules run git: an argv array (never a shell string), a bounded wait, no prompt, and an
 * environment that cannot select another repository. `runGit` never throws; `gitOutput` and `mustAsk` are the
 * throwing forms for facts a caller cannot proceed without.
 *
 * @es La única forma en que los módulos del kit corren git: argv en array (nunca una cadena de shell), espera
 * acotada, sin diálogos y con un entorno que no puede elegir otro repositorio. `runGit` nunca lanza; `gitOutput`
 * y `mustAsk` son las formas que lanzan, para hechos sin los que quien llama no puede seguir.
 */

import { spawnSync } from 'node:child_process';

/** Default bound for one git command, in milliseconds (0 means unbounded). @es Límite por defecto de una orden de git, en milisegundos (0 es sin límite). */
export const GIT_TIMEOUT_MS = 15000;

/** Variables that make git pick a repository instead of discovering one (a git hook exports them). @es Variables que hacen que git elija repositorio (un hook las exporta). */
const REPOSITORY_SELECTORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];

/** Raised when git cannot give the answer a caller needs. @es Se lanza cuando git no da la respuesta que quien llama necesita. */
export class GitFailure extends Error {}

/**
 * Runs `git <gitOptions...> <args...>` in `cwd` (the process directory when `undefined`). Never throws.
 * @es Corre git en `cwd` (el directorio del proceso si es `undefined`). Nunca lanza.
 * @param {string | undefined} cwd
 * @param {string[]} args
 * @param {{ gitOptions?: string[], input?: string, timeoutMs?: number, env?: Record<string, string> }} [options]
 *   `env` adds variables over the parent's; the repository selectors are removed afterwards, so it cannot pass them.
 * @returns {{ status: number | null, stdout: string, stderr: string, timedOut: boolean }} `status` is `null` when
 *   git did not start or was killed; `stdout` is raw; `stderr` ends with the spawn error text when there was one.
 */
export function runGit(cwd, args, { gitOptions = [], input, timeoutMs = GIT_TIMEOUT_MS, env } = {}) {
  const childEnv = { ...process.env, ...env };

  for (const name of REPOSITORY_SELECTORS) delete childEnv[name];
  childEnv.GIT_TERMINAL_PROMPT = '0';

  const result = spawnSync('git', [...gitOptions, ...args], { cwd, encoding: 'utf8', input, timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, windowsHide: true, env: childEnv });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${result.error ? result.error.message : ''}`,
    timedOut: result.error?.code === 'ETIMEDOUT'
  };
}

/** The bilingual failure of `what` given git's answer. @es El fallo bilingüe de `what` según la respuesta de git. */
function failure(what, answer) {
  const why = answer.timedOut ? 'timed out' : `exit ${answer.status}: ${answer.stderr.trim()}`;
  const porque = answer.timedOut ? 'agotó el tiempo' : `salida ${answer.status}: ${answer.stderr.trim()}`;

  return new GitFailure(`${what} failed (${why}). @es ${what} falló (${porque}).`);
}

/**
 * The stdout of `git <gitOptions...> <args...>`, or a thrown bilingual GitFailure naming the command.
 * @es La salida de git, o un GitFailure bilingüe que nombra la orden.
 */
export function gitOutput(cwd, args, options) {
  const answer = runGit(cwd, args, options);

  if (answer.status === 0) return answer.stdout;
  throw failure(['git', ...(options?.gitOptions ?? []), ...args].join(' '), answer);
}

/** An asker bound to one directory and its options: `ask('rev-parse', 'HEAD')`. @es Un «preguntador» ligado a un directorio y a sus opciones. */
export const gitAsker = (cwd, options) => (...args) => runGit(cwd, args, options);

/** `ask(...args).stdout`, or a thrown GitFailure when git said no. @es `stdout`, o un GitFailure cuando git dice que no. */
export function mustAsk(ask, ...args) {
  const answer = ask(...args);

  if (answer.status === 0) return answer.stdout;
  throw failure(`git ${args.join(' ')}`, answer);
}

/** NUL-separated git output as entries. @es Salida de git separada por NUL, como entradas. */
export const entriesOf = (output) => output.split('\0').filter((entry) => entry !== '');
