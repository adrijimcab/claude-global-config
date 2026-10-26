#!/usr/bin/env node
/**
 * Checks that every buildable project of the `angular.json` in a directory declares, in its production
 * configuration, an error budget for each type named in `config.json`, and that no error limit is above its
 * cap. Usage: `node check-budgets.mjs <dir>`. Exit 0 every budget present and within its cap; 1 a problem;
 * 2 nothing could be measured: the directory holds no readable `angular.json` with a project to check, or the
 * cap table `config.json` is unreadable or holds a cap that is not a size (a defect of the kit, never a pass).
 * Every budget of a type is compared with its cap, not only the first one declared.
 *
 * Decision: `ng build` is what ENFORCES a budget; this gate guards the DECLARATION that `ng build` reads, so
 * a budget cannot be removed, left without an error limit, or loosened past the cap without going red.
 *
 * @es Comprueba que cada proyecto compilable del `angular.json` de un directorio declare, en su configuración
 * de producción, un presupuesto de error por cada tipo de `config.json`, y que ningún límite de error supere
 * su tope. Salida 0 todo en regla; 1 algún problema; 2 no se pudo medir nada: sin `angular.json` legible ni
 * proyecto que comprobar, o la tabla de topes `config.json` es ilegible o trae un tope que no es un tamaño (un
 * defecto del kit, nunca un aprobado). Se compara CADA presupuesto de un tipo con su tope, no solo el primero.
 * `ng build` es lo que APLICA un presupuesto; este gate vigila la DECLARACIÓN que `ng build` lee.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSpeaker } from '../../../bilingual-output/speaker.mjs';

const UNITS = { b: 1, kb: 1024, mb: 1024 * 1024 };
const DEFAULT_CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.json');

const MESSAGES = {
  configUnreadable: { en: 'cap table {file} is unreadable or holds no caps: no budget was checked', es: 'la tabla de topes {file} es ilegible o no trae topes: no se comprobó ningún presupuesto' },
  configCap: { en: 'cap table {file}: the {type} cap "{value}" is not a size in b, kb or mb: no budget was checked', es: 'tabla de topes {file}: el tope "{value}" de {type} no es un tamaño en b, kb o mb: no se comprobó ningún presupuesto' },
  unreadable: { en: '{dir} holds no readable angular.json with a buildable project', es: '{dir} no tiene un angular.json legible con un proyecto compilable' },
  missing: { en: 'project {project}: no {type} budget with a maximumError', es: 'proyecto {project}: falta un presupuesto {type} con maximumError' },
  invalid: { en: 'project {project}: {type} maximumError "{value}" is not a size in b, kb or mb', es: 'proyecto {project}: el maximumError "{value}" de {type} no es un tamaño en b, kb o mb' },
  over: { en: 'project {project}: {type} maximumError {value} is above the cap {cap}', es: 'proyecto {project}: el maximumError {value} de {type} supera el tope {cap}' },
  ok: { en: '{count} budget declaration(s) within their caps', es: '{count} declaración(es) de presupuesto dentro de sus topes' },
};

/** Size text to bytes, or `undefined` when it is not `<number><b|kb|mb>`. @es Tamaño a bytes. */
function toBytes(text) {
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb)$/i.exec(String(text).trim());

  return match === null ? undefined : Number(match[1]) * UNITS[match[2].toLowerCase()];
}

/** The problems of ONE budget against its cap (already in bytes), as `[messageId, params]`. @es Problemas de UN presupuesto. */
function budgetProblems(project, type, budget, cap, capBytes) {
  const bytes = toBytes(budget.maximumError);

  if (bytes === undefined) return [['invalid', { project, type, value: budget.maximumError }]];

  return bytes > capBytes ? [['over', { project, type, value: budget.maximumError, cap }]] : [];
}

/** The problems of one project's budgets against the caps, as `[messageId, params]`. @es Problemas de un proyecto. */
function projectProblems(project, budgets, caps) {
  return Object.entries(caps).flatMap(([type, { maximumError: cap }]) => {
    const declared = budgets.filter((entry) => entry.type === type && entry.maximumError !== undefined);

    if (declared.length === 0) return [['missing', { project, type }]];

    const capBytes = toBytes(cap);

    return declared.flatMap((budget) => budgetProblems(project, type, budget, cap, capBytes));
  });
}

/**
 * The cap table in `file` as `{ caps }`, or `{ problem: [messageId, params] }` when it cannot be read, is not an
 * object of types, or holds a cap that is not a size: a cap the gate cannot compare must never compare as "within".
 * @es La tabla de topes de `file` como `{ caps }`, o `{ problem }` si no se lee, no es un objeto de tipos o trae un
 * tope que no es un tamaño: un tope que el gate no puede comparar nunca debe comparar como "dentro".
 */
function loadCaps(file) {
  let caps;

  try {
    caps = JSON.parse(readFileSync(file, 'utf8')).caps;
  } catch {
    return { problem: ['configUnreadable', { file }] };
  }

  const entries = caps !== null && typeof caps === 'object' ? Object.entries(caps) : [];

  if (entries.length === 0) return { problem: ['configUnreadable', { file }] };

  const bad = entries.find(([, entry]) => typeof entry?.maximumError !== 'string' || toBytes(entry.maximumError) === undefined);

  return bad === undefined ? { caps } : { problem: ['configCap', { file, type: bad[0], value: String(bad[1]?.maximumError) }] };
}

/** Runs the check over `dir` and returns the exit code. @es Corre la comprobación y devuelve la salida. */
export function main(dir, sink = console, configFile = DEFAULT_CONFIG) {
  const speaker = makeSpeaker(MESSAGES, sink);
  const { caps, problem } = loadCaps(configFile);

  if (problem !== undefined) {
    speaker.complain(...problem);

    return 2;
  }

  let projects;

  try {
    projects = Object.entries(JSON.parse(readFileSync(path.join(dir, 'angular.json'), 'utf8')).projects ?? {});
  } catch {
    projects = [];
  }

  const builds = projects.map(([name, project]) => [name, (project.architect ?? project.targets)?.build]).filter(([, build]) => build !== undefined);

  if (builds.length === 0) {
    speaker.complain('unreadable', { dir });

    return 2;
  }

  const problems = builds.flatMap(([name, build]) => projectProblems(name, build.configurations?.production?.budgets ?? [], caps));

  for (const [id, params] of problems) speaker.complain(id, params);
  if (problems.length === 0) speaker.say('ok', { count: builds.length * Object.keys(caps).length });

  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(path.resolve(process.argv[2] ?? '.')));
}
