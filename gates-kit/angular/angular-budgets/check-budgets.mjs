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

import { makeSpeaker } from '../../../bilingual-output/speaker.mjs';

const UNITS = { b: 1, kb: 1024, mb: 1024 * 1024 };

const MESSAGES = {
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

/** The problems of one project's budgets against the caps, as `[messageId, params]`. @es Problemas de un proyecto. */
function projectProblems(project, budgets, caps) {
  return Object.entries(caps).flatMap(([type, { maximumError: cap }]) => {
    const budget = budgets.find((entry) => entry.type === type && entry.maximumError !== undefined);

    if (budget === undefined) return [['missing', { project, type }]];

    const bytes = toBytes(budget.maximumError);

    if (bytes === undefined) return [['invalid', { project, type, value: budget.maximumError }]];

    return bytes > toBytes(cap) ? [['over', { project, type, value: budget.maximumError, cap }]] : [];
  });
}

/** Runs the check over `dir` and returns the exit code. @es Corre la comprobación y devuelve la salida. */
export function main(dir, sink = console) {
  const speaker = makeSpeaker(MESSAGES, sink);
  const caps = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.json'), 'utf8')).caps;
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
