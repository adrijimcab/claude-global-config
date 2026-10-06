/**
 * Rules over the argv of a gate command that runs a package through `run-tool.mjs`, read as an argv array,
 * never as text. Two decisions:
 *
 * 1. The reporter is pinned explicitly. A summarising runner reads the gate logs; a tool's default output can
 *    change with its version, its TTY detection or a project config, so every gate names its reporter: ESLint
 *    `--format`, `tsc --pretty false`, Vitest `--reporter`, Jest, Karma and Stryker `--reporters`,
 *    dependency-cruiser `--output-type`. The flag must carry a value (`--flag value` or `--flag=value`); `tsc`
 *    must say `false`. A package the table does not know is refused (`reporter-unknown`), so a new tool cannot
 *    enter without its reporter being decided.
 * 2. `eslint --quiet` is banned (`quiet-flag`): it drops every warning from the report, so the run measures
 *    errors only while `--max-warnings 0` reads as if warnings were counted.
 *
 * Returns `[{ id, detail }]`; empty when the command complies or runs no package.
 *
 * @es Reglas sobre el argv del comando de un gate que corre un paquete con `run-tool.mjs`, leído como array,
 * nunca como texto. 1) El reporter se fija explícitamente, porque un runner que resume lee los logs y la salida
 * por defecto de una herramienta cambia con su versión, su detección de TTY o la config del proyecto; el flag
 * debe llevar valor y `tsc` debe decir `false`; un paquete que la tabla no conoce se rechaza. 2) `eslint
 * --quiet` está prohibido: quita los warnings del informe y cambia lo que se mide.
 */

import { launcherCallOf } from './gate-layout.mjs';

/** The reporter flag of each package, and the value it must hold when only one is right. @es El flag de reporter de cada paquete. */
export const REPORTER_FLAGS = {
  eslint: { flag: '--format' },
  typescript: { flag: '--pretty', value: 'false' },
  vitest: { flag: '--reporter' },
  jest: { flag: '--reporters' },
  karma: { flag: '--reporters' },
  '@stryker-mutator/core': { flag: '--reporters' },
  'dependency-cruiser': { flag: '--output-type' },
};

/** Flags banned per package (see decision 2). @es Flags prohibidos por paquete (ver la decisión 2). */
export const BANNED_FLAGS = { eslint: ['--quiet'] };

/** The value given to `flag` in `args`, `undefined` when absent or valueless. @es El valor de `flag`, o `undefined`. */
function valueOf(args, flag) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1) || undefined;
    if (arg === flag) {
      const next = args[index + 1];

      return next === undefined || next.startsWith('-') ? undefined : next;
    }
  }

  return undefined;
}

/**
 * The problems of one gate command. See the module header.
 * @es Los problemas del comando de un gate. Ver la cabecera.
 */
export function commandProblems(command) {
  const call = launcherCallOf(command);

  if (call === undefined) return [];

  const { tool, args } = call;
  const problems = [];
  const reporter = REPORTER_FLAGS[tool];

  for (const banned of BANNED_FLAGS[tool] ?? []) if (args.some((arg) => arg === banned || arg.startsWith(`${banned}=`))) problems.push({ id: 'quiet-flag', detail: `${tool} ${banned}` });

  if (reporter === undefined) {
    problems.push({ id: 'reporter-unknown', detail: tool });
  } else {
    const value = valueOf(args, reporter.flag);

    if (value === undefined || (reporter.value !== undefined && value !== reporter.value)) problems.push({ id: 'reporter-not-pinned', detail: `${tool} ${reporter.flag}${reporter.value === undefined ? '' : ` ${reporter.value}`}` });
  }

  return problems;
}
