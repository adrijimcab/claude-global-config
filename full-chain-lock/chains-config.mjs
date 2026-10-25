/**
 * The adapter that reads the declared set of full chains (`chains.json`) and validates its shape. The set is
 * CONFIGURATION, never code: a new project or a new chain is a new entry, and the guard and the runner do not
 * change. One entry per project: `project` (a name), `scripts` (package scripts that are full chains) and
 * `commands` (path suffixes of node programs that are full chains, such as the selftest runner).
 *
 * A malformed declaration throws a bilingual error naming the file and the problem, so a typo cannot make the
 * guard silently cover nothing: the selftest loads the real file through this function.
 *
 * @es El adaptador que lee el conjunto declarado de cadenas completas (`chains.json`) y valida su forma. El
 * conjunto es CONFIGURACIÓN, nunca código: un proyecto o una cadena nuevos son una entrada nueva y ni el guard ni
 * el runner cambian. Una entrada por proyecto: `project`, `scripts` (scripts de paquete que son cadenas
 * completas) y `commands` (sufijos de ruta de programas node que lo son, como el runner de selftests). Una
 * declaración mal formada lanza un error bilingüe con el fichero y el problema.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { speak } from './messages.mjs';

/** The declaration that ships beside this module. @es La declaración que viaja junto a este módulo. */
export const DECLARATION = path.join(path.dirname(fileURLToPath(import.meta.url)), 'chains.json');

/** Whether `value` is an array of non-empty strings. @es Si `value` es un array de cadenas no vacías. */
const isNameList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim() !== '');

/** The first problem of a parsed declaration, or `undefined`. @es El primer problema de una declaración leída, o `undefined`. */
function problemOf(parsed) {
  if (!Array.isArray(parsed?.projects) || parsed.projects.length === 0) return '"projects" must be a non-empty array. @es "projects" debe ser un array no vacío.';

  const seen = new Set();

  for (const [index, entry] of parsed.projects.entries()) {
    if (typeof entry?.project !== 'string' || entry.project.trim() === '') return `projects[${String(index)}].project must be a non-empty string. @es projects[${String(index)}].project debe ser un texto no vacío.`;
    if (seen.has(entry.project)) return `project "${entry.project}" is declared twice. @es el proyecto "${entry.project}" está declarado dos veces.`;
    if (!isNameList(entry.scripts)) return `projects[${String(index)}].scripts must be an array of non-empty strings. @es projects[${String(index)}].scripts debe ser un array de textos no vacíos.`;
    if (!isNameList(entry.commands)) return `projects[${String(index)}].commands must be an array of non-empty strings. @es projects[${String(index)}].commands debe ser un array de textos no vacíos.`;
    if (entry.scripts.length + entry.commands.length === 0) return `project "${entry.project}" declares no chain. @es el proyecto "${entry.project}" no declara ninguna cadena.`;

    seen.add(entry.project);
  }

  return undefined;
}

/**
 * The declared chains: `{ projects: [{ project, scripts, commands }] }`.
 * @throws {Error} bilingual, when the file cannot be read, is not JSON, or has the wrong shape.
 * @es Las cadenas declaradas. Lanza un error bilingüe si el fichero no se lee, no es JSON o tiene mala forma.
 */
export function loadChains(file = DECLARATION, read = readFileSync) {
  const say = speak();
  let parsed;

  try {
    parsed = JSON.parse(read(file, 'utf8'));
  } catch (error) {
    throw new Error(say.line('config-invalid', { file, problem: error instanceof Error ? error.message : String(error) }), { cause: error });
  }

  const problem = problemOf(parsed);

  if (problem !== undefined) throw new Error(say.line('config-invalid', { file, problem }));

  return parsed;
}
