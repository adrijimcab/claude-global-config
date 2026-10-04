#!/usr/bin/env node
/**
 * Checks that every buildable project of the `angular.json` in a directory declares, in its production
 * configuration, an error budget for each type named in `config.json`, and that no error limit is above its
 * cap. Usage: `node check-budgets.mjs <dir>`. Exit 0 every budget present and within its cap; 1 a problem;
 * 2 the directory holds no readable `angular.json` with a project to check.
 *
 * Decision: `ng build` is what ENFORCES a budget; this gate guards the DECLARATION that `ng build` reads, so
 * a budget cannot be removed, left without an error limit, or loosened past the cap without going red.
 *
 * @es Comprueba que cada proyecto compilable del `angular.json` de un directorio declare, en su configuración
 * de producción, un presupuesto de error por cada tipo de `config.json`, y que ningún límite de error supere
 * su tope. Salida 0 todo en regla; 1 algún problema; 2 sin `angular.json` legible ni proyecto que comprobar.
 * `ng build` es lo que APLICA un presupuesto; este gate vigila la DECLARACIÓN que `ng build` lee.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UNITS = { b: 1, kb: 1024, mb: 1024 * 1024 };

/** Every message: `[English, Spanish]`. @es Todos los mensajes: `[inglés, español]`. */
const MESSAGES = {
  unreadable: ['{dir} holds no readable angular.json with a buildable project', '{dir} no tiene un angular.json legible con un proyecto compilable'],
  missing: ['project {project}: no {type} budget with a maximumError', 'proyecto {project}: falta un presupuesto {type} con maximumError'],
  invalid: ['project {project}: {type} maximumError "{value}" is not a size in b, kb or mb', 'proyecto {project}: maximumError "{value}" de {type} no es un tamaño en b, kb o mb'],
  over: ['project {project}: {type} maximumError {value} is above the cap {cap}', 'proyecto {project}: maximumError {value} de {type} supera el tope {cap}'],
  ok: ['{count} budget declaration(s) within their caps', '{count} declaración(es) de presupuesto dentro de sus topes'],
};

function say(id, values = {}) {
  const [english, spanish] = MESSAGES[id].map((half) => half.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? '')));

  return `${english} @es ${spanish}`;
}

/** Size text to bytes, or `undefined` when it is not `<number><b|kb|mb>`. @es Tamaño a bytes. */
function toBytes(text) {
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb)$/i.exec(String(text).trim());

  return match === null ? undefined : Number(match[1]) * UNITS[match[2].toLowerCase()];
}

/** The problems of one project's budgets against the caps. @es Problemas de los presupuestos de un proyecto. */
function projectProblems(project, budgets, caps) {
  return Object.entries(caps).flatMap(([type, { maximumError: cap }]) => {
    const budget = budgets.find((entry) => entry.type === type && entry.maximumError !== undefined);

    if (budget === undefined) return [say('missing', { project, type })];

    const bytes = toBytes(budget.maximumError);

    if (bytes === undefined) return [say('invalid', { project, type, value: budget.maximumError })];

    return bytes > toBytes(cap) ? [say('over', { project, type, value: budget.maximumError, cap })] : [];
  });
}

/** Runs the check over `dir` and returns the exit code. @es Corre la comprobación y devuelve la salida. */
export function main(dir, print = console.log) {
  const caps = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.json'), 'utf8')).caps;
  let projects;

  try {
    projects = Object.entries(JSON.parse(readFileSync(path.join(dir, 'angular.json'), 'utf8')).projects ?? {});
  } catch {
    projects = [];
  }

  const builds = projects.map(([name, project]) => [name, (project.architect ?? project.targets)?.build]).filter(([, build]) => build !== undefined);

  if (builds.length === 0) {
    print(say('unreadable', { dir }));

    return 2;
  }

  const problems = builds.flatMap(([name, build]) => projectProblems(name, build.configurations?.production?.budgets ?? [], caps));

  for (const problem of problems) print(problem);
  if (problems.length === 0) print(say('ok', { count: builds.length * Object.keys(caps).length }));

  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(path.resolve(process.argv[2] ?? '.')));
}
