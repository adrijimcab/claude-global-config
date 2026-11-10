/**
 * Whether the selftest runner was started under the full-chain lock, and the exact command that starts it there.
 * The whole runner is a full chain (`full-chain-lock/chains.json`), and the guard of that lock only sees a top-level
 * command line, so a script that runs the runner inside itself escapes it. The runner therefore checks for itself:
 * `full-chain-lock/run.mjs` gives its command `FULL_CHAIN_LOCK_TOKEN`, and the runner starts only when that value
 * holds the lock now. The question "does this token hold the lock?" is the port `full-chain-lock/lock-token.mjs`,
 * handed in by the caller; nothing here reads the lock.
 *
 * @es Si el runner de selftests se inició bajo el lock de cadenas completas, y el comando exacto que lo inicia allí.
 * El runner entero es una cadena completa y el guard de ese lock solo ve una línea de órdenes de nivel superior, así
 * que un script que ejecuta el runner por dentro lo esquiva. Por eso el runner comprueba por sí mismo:
 * `full-chain-lock/run.mjs` da a su comando `FULL_CHAIN_LOCK_TOKEN` y el runner arranca solo si ese valor tiene el lock
 * ahora. La pregunta «¿este token tiene el lock?» es el puerto `full-chain-lock/lock-token.mjs`, que entrega quien
 * llama; aquí nada lee el lock.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCK_TOKEN_VARIABLE } from '../full-chain-lock/lock-token.mjs';

/** The lock's runner and this runner, absolute, with forward slashes (accepted by Bash and PowerShell). @es El runner del lock y este runner, absolutos y con barras normales. */
const slashed = (relative) => fileURLToPath(new URL(relative, import.meta.url)).split('\\').join('/');

const LOCK_RUNNER = slashed('../full-chain-lock/run.mjs');
const SELFTEST_RUNNER = slashed('./run.mjs');

/** The chain name this runner is declared under in `full-chain-lock/chains.json`. @es El nombre de cadena con el que este runner está declarado en `chains.json`. */
const CHAIN = 'selftest-runner';

/** Characters a word may hold without quoting for the shell. @es Caracteres que una palabra puede llevar sin comillas para el shell. */
const PLAIN_WORD = /^[A-Za-z0-9_./:\\=@+,-]+$/;

/** A word of the command line, quoted when it needs it. @es Una palabra de la línea de órdenes, entrecomillada si hace falta. */
const word = (text) => (PLAIN_WORD.test(text) ? text : `"${text}"`);

/**
 * @param {Record<string, string | undefined>} environment The environment the runner was started with.
 * @param {(token: string) => boolean} holdsLock The port: whether this token holds the lock now.
 * @returns {boolean} true only for a present token that holds the lock; a missing, empty, copied, stale or forged one answers false.
 * @es true solo para un token presente que tiene el lock; uno ausente, vacío, copiado, caducado o falsificado responde false.
 */
export function startedUnderLock(environment, holdsLock) {
  const token = environment[LOCK_TOKEN_VARIABLE];

  return typeof token === 'string' && token !== '' && holdsLock(token) === true;
}

/**
 * The command that runs this runner over `root` through the lock, so a refusal can say exactly what to type.
 * @param {string[]} argv The runner's own arguments as they were given.
 * @param {string} root The tree the run measures.
 * @returns {string}
 * @es El comando que ejecuta este runner sobre `root` por el lock, para que la negativa diga exactamente qué escribir.
 */
export function lockedCommand(argv, root) {
  return `node ${word(LOCK_RUNNER)} --chain ${CHAIN} --tree ${word(path.resolve(root).split('\\').join('/'))} -- node ${word(SELFTEST_RUNNER)}${argv.map((argument) => ` ${word(argument)}`).join('')}`;
}

export { LOCK_TOKEN_VARIABLE };
