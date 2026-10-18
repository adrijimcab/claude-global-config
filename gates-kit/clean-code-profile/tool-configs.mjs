/**
 * Reads the configuration files of the tools the profile grades, from a project root: the ESLint config file
 * (existence only: ESLint itself answers what it holds, see `eslint-facts.mjs`), the dependency-cruiser config
 * (loaded as a module, so its own regexes are the evidence), the jscpd settings, the knip config with its count of
 * ignore entries, and the stack. A file it cannot read is reported as present-but-unreadable, never as absent.
 *
 * @es Lee los ficheros de configuración de las herramientas que el perfil califica, desde la raíz de un proyecto: el
 * fichero de config de ESLint (solo su existencia: lo que contiene lo responde ESLint, ver `eslint-facts.mjs`), la
 * config de dependency-cruiser (cargada como módulo, así que sus propias regex son la evidencia), los ajustes de
 * jscpd, la config de knip con su recuento de entradas ignore y el stack. Un fichero ilegible se informa como
 * presente-pero-ilegible, nunca como ausente.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runInstalledKnip } from './knip-facts.mjs';
import { readJson, readJsonResult } from './landing-path.mjs';

const ESLINT_CONFIGS = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc'];
const DEPCRUISE_CONFIGS = ['.dependency-cruiser.cjs', '.dependency-cruiser.js', '.dependency-cruiser.mjs', '.dependency-cruiser.json'];
const KNIP_CONFIGS = ['knip.json', 'knip.jsonc', '.knip.json', '.knip.jsonc', 'knip.ts', 'knip.js', 'knip.config.ts', 'knip.config.js'];

/** The first of `names` that exists under `root`, as a path. @es El primero de `names` que existe bajo `root`. */
export function firstExisting(root, names) {
  const found = names.find((name) => existsSync(path.join(root, name)));

  return found === undefined ? undefined : path.join(root, found);
}

/** The ESLint config file of the project, or undefined, with the names searched. @es El fichero de config de ESLint, o undefined. */
export function eslintConfig(root) {
  return { file: firstExisting(root, ESLINT_CONFIGS), searched: ['eslint.config.{js,mjs,cjs,ts,mts,cts}', '.eslintrc{,.json,.js,.cjs,.yml,.yaml}'] };
}

/** `angular` when `@angular/core` is a dependency, else `node`. @es `angular` si `@angular/core` es dependencia, si no `node`. */
export function detectStack(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  const dependencies = { ...pkg?.dependencies, ...pkg?.devDependencies };

  return Object.hasOwn(dependencies, '@angular/core') ? 'angular' : 'node';
}

/** The dependency-cruiser config as `{ file, config }`, `{ file, error }` or undefined. @es La config de dependency-cruiser. */
export async function depcruiseConfig(root) {
  const file = firstExisting(root, DEPCRUISE_CONFIGS);

  if (file === undefined) return undefined;

  try {
    const loaded = file.endsWith('.json') ? readJson(file) : await import(pathToFileURL(file).href);

    return { file, config: loaded?.default ?? loaded };
  } catch (error) {
    return { file, error: String(error.message) };
  }
}

/** The jscpd settings as `{ file, config }`, `{ file, error }` when `.jscpd.json` is unreadable, or undefined. @es Los ajustes de jscpd; `{ file, error }` si `.jscpd.json` es ilegible. */
export function jscpdConfig(root) {
  const file = path.join(root, '.jscpd.json');

  const read = readJsonResult(file);

  if (read.state === 'invalid') return { file, error: 'cannot be read or is not valid JSON @es no se puede leer o no es JSON válido' };
  if (read.state === 'ok') return { file, config: read.value };

  const inPackage = readJson(path.join(root, 'package.json'))?.jscpd;

  return inPackage === undefined ? undefined : { file: path.join(root, 'package.json'), config: inPackage };
}

/** How many entries every `ignore*` list of a knip config holds, nested workspaces included. @es Cuántas entradas guardan las listas `ignore*` de una config de knip. */
export function knipIgnoreEntries(config) {
  if (config === null || typeof config !== 'object') return 0;

  return Object.entries(config).reduce((total, [key, value]) => {
    if (/^ignore/.test(key) && Array.isArray(value)) return total + value.length;

    return total + knipIgnoreEntries(value);
  }, 0);
}

/** knip's answer as the ignore debt of a config: `{ ignoreEntries }`, or `{ ignoreEntries: undefined, reason }` when it could not say. @es La respuesta de knip como deuda ignore de una config. */
function debtOf(answer) {
  return answer.error === undefined ? { ignoreEntries: answer.ignoreEntries } : { ignoreEntries: undefined, reason: answer.error };
}

/**
 * The ignore debt of a knip config FILE. A `.json` file is JSON and is counted here; any other (`knip.ts`,
 * `knip.js`, `knip.jsonc`) is code or JSON with comments, so knip itself is asked (`askKnip`). `ignoreEntries` is
 * `undefined` (with a `reason`) when the debt could not be measured, which is not the same as zero.
 * @es La deuda ignore de un FICHERO de config de knip. Un `.json` es JSON y se cuenta aquí; cualquier otro
 * (`knip.ts`, `knip.js`, `knip.jsonc`) es código o JSON con comentarios, así que se le pregunta a knip
 * (`askKnip`). `ignoreEntries` es `undefined` (con `reason`) si no se pudo medir, que no es lo mismo que cero.
 */
function fileDebt(root, file, askKnip) {
  if (!file.endsWith('.json')) return debtOf(askKnip(root, file));

  const read = readJsonResult(file);

  return read.state === 'ok' ? { config: read.value, ignoreEntries: knipIgnoreEntries(read.value) } : { ignoreEntries: undefined, reason: 'cannot be read or is not valid JSON @es no se puede leer o no es JSON válido' };
}

/** The knip config as `{ file, config?, ignoreEntries, reason? }` or undefined. @es La config de knip. */
export function knipConfig(root, askKnip = runInstalledKnip) {
  const file = firstExisting(root, KNIP_CONFIGS);

  if (file !== undefined) return { file, ...fileDebt(root, file, askKnip) };

  const inPackage = readJson(path.join(root, 'package.json'))?.knip;

  return inPackage === undefined ? undefined : { file: path.join(root, 'package.json'), config: inPackage, ignoreEntries: knipIgnoreEntries(inPackage) };
}
