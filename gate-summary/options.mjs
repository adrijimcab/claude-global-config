/**
 * Reads the command line: the options before `--`, and the command after it as an argv array.
 * @es Lee la línea de órdenes: las opciones antes de `--` y la orden después, como array argv.
 */

import { defaultState } from './run-directory.mjs';

const NUMERIC = new Set(['--excerpt', '--timeout']);
const TEXT = new Set(['--cwd', '--state']);

/**
 * @returns `{ cwd, state, excerpt, timeout, argv }`, or `{ problem }` naming the offending option.
 * @es Devuelve las opciones, o `{ problem }` con la opción culpable.
 */
export function parseOptions(args, cwd = process.cwd()) {
  const options = { cwd, state: defaultState(), excerpt: 20, timeout: 0, argv: [] };
  const separator = args.indexOf('--');

  if (separator === -1 || separator === args.length - 1) return { problem: '--' };

  for (let at = 0; at < separator; at += 2) {
    const [name, value] = [args[at], args[at + 1]];
    const key = name?.slice(2);

    if (at + 1 >= separator || !(NUMERIC.has(name) || TEXT.has(name))) return { problem: name };
    if (NUMERIC.has(name) && !(Number.isInteger(Number(value)) && Number(value) >= 0)) return { problem: name };

    options[key] = NUMERIC.has(name) ? Number(value) : value;
  }

  options.argv = args.slice(separator + 1);

  return options;
}
