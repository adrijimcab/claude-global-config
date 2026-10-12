/**
 * Asks the TypeScript compiler what the project's `tsconfig.json` resolves to, instead of reading the file as text
 * (it may extend another): `tsc --showConfig -p tsconfig.json` prints the merged options. The run is a function
 * the caller passes in so a proof can answer without a real compiler; `runInstalledTsc` is the real one.
 *
 * @es Pregunta al compilador de TypeScript en qué resuelve el `tsconfig.json` del proyecto, en vez de leer el
 * fichero como texto (puede extender otro): `tsc --showConfig -p tsconfig.json` imprime las opciones fusionadas.
 * La ejecución es una función que pasa quien llama; `runInstalledTsc` es la real.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SHOW_CONFIG_TIMEOUT_MS = 120_000;

/** The real runner. Answers `{ file }` plus `{ strict }`, `{ error }` or `{ missing: true }`. @es El ejecutor real. */
export function runInstalledTsc(root) {
  const file = 'tsconfig.json';

  if (!existsSync(path.join(root, file))) return { file, missing: true };

  const bin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

  if (!existsSync(bin)) return { file, error: 'typescript is not installed under node_modules @es typescript no está instalado en node_modules' };

  const result = spawnSync(process.execPath, [bin, '--showConfig', '-p', file], { cwd: root, encoding: 'utf8', timeout: SHOW_CONFIG_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });

  if (result.error !== undefined || result.status !== 0) return { file, error: `tsc --showConfig exited ${result.status ?? 'without a status'}: ${(result.error?.message ?? result.stdout).trim().slice(0, 200)}` };

  try {
    return { file, strict: JSON.parse(result.stdout).compilerOptions?.strict === true };
  } catch (error) {
    return { file, error: `tsc --showConfig printed no JSON: ${error.message}` };
  }
}
