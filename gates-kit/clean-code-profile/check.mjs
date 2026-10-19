#!/usr/bin/env node
/**
 * The clean-code profile checker: `node check.mjs <project root> [--stack angular|node] [--strict]`. For every
 * gate of the profile it reports whether the project has it ENFORCED on its landing path, CONFIGURED-ONLY or
 * ABSENT (or UNMEASURED when the tool that answers could not run), each with the evidence that decided it: the
 * file and line, the root that reaches it, what ESLint or the compiler answered. It writes no file, but it is not
 * a passive reader: it runs the project's own installed tools (ESLint, the compiler, and knip, which loads a
 * `knip.ts` or `knip.js` as code and may run for up to 300 s) and loads a dependency-cruiser config written as
 * code, so it executes the project's code; run it only on a project you trust. Exit: 0 the report was produced; 1 with `--strict` when some gate is not enforced; 2 nothing was measured.
 *
 * @es El checker del perfil de código limpio: `node check.mjs <raíz del proyecto> [--stack angular|node]
 * [--strict]`. Para cada gate del perfil informa si el proyecto lo tiene APLICADO en su camino de aterrizaje,
 * SOLO-CONFIGURADO o AUSENTE (o SIN-MEDIR si la herramienta que responde no pudo correr), cada uno con la
 * evidencia que lo decidió: fichero y línea, la raíz que lo alcanza, lo que respondió ESLint o el compilador.
 * No escribe ningún fichero, pero no es un lector pasivo: ejecuta las herramientas instaladas del propio proyecto
 * (ESLint, el compilador y knip, que carga un `knip.ts` o `knip.js` como código y puede correr hasta 300 s) y
 * carga una config de dependency-cruiser escrita como código, así que ejecuta código del proyecto; solo debe
 * ejecutarse sobre un proyecto de confianza. Salida: 0 se produjo el informe; 1 con `--strict` si algún gate no está aplicado; 2 no
 * se midió nada.
 */

import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { halvesOf } from '../../bilingual-output/message.mjs';
import { makeSpeaker } from '../../bilingual-output/speaker.mjs';

import { collectFacts } from './collect-facts.mjs';
import { MESSAGES } from './messages.mjs';
import { STACKS } from './profile.mjs';
import { ABSENT, CONFIGURED_ONLY, ENFORCED, UNMEASURED } from './verdict-parts.mjs';
import { gradeProject } from './verdicts.mjs';

const EXIT_STRICT = 1;
const EXIT_NOT_MEASURED = 2;

/** The options of the command line, or undefined when it is unusable. @es Las opciones de la línea de comandos, o undefined si no sirve. */
export function parseArguments(argv) {
  const options = { root: undefined, stack: undefined, strict: false };

  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];

    if (word === '--strict') options.strict = true;
    else if (word === '--stack') {
      options.stack = argv[index + 1];
      index += 1;
      if (options.stack === undefined) return undefined;
    } else if (word.startsWith('--') || options.root !== undefined) return undefined;
    else options.root = word;
  }

  if (options.root === undefined || (options.stack !== undefined && !STACKS.includes(options.stack))) return undefined;

  return options;
}

/** The count of each state among the verdicts. @es El recuento de cada estado entre los veredictos. */
export function tally(verdicts) {
  const count = (state) => verdicts.filter((verdict) => verdict.verdict === state).length;

  return { enforced: count(ENFORCED), configured: count(CONFIGURED_ONLY), absent: count(ABSENT), unmeasured: count(UNMEASURED), total: verdicts.length };
}

/** The roots as `kind:name` for up to three of a kind, else `kind x count`. @es Las raíces como `tipo:nombre` hasta tres por tipo, si no `tipo x cantidad`. */
export function rootsSummary(roots) {
  const kinds = [...new Set(roots.map((root) => root.kind))];

  return kinds
    .flatMap((kind) => {
      const named = roots.filter((root) => root.kind === kind);

      return named.length <= 3 ? named.map((root) => `${kind}:${root.name}`) : [`${kind} x${named.length}`];
    })
    .join(', ');
}

/** Prints the report of one project through `speaker`. @es Imprime el informe de un proyecto por `speaker`. */
export function printReport(speaker, facts, verdicts) {
  speaker.say('header', { root: facts.root, stack: facts.stack });
  speaker.say(facts.landing.roots.length > 0 ? 'roots' : 'noRoots', { roots: rootsSummary(facts.landing.roots) });

  for (const verdict of verdicts) {
    speaker.data(`${verdict.verdict.toUpperCase().padEnd(15)} ${verdict.id}${verdict.landingGuard ? '  (landing guard)' : ''}`);
    for (const entry of verdict.evidence) speaker.data(`    - ${speaker.line(entry.id, entry.params)}`);
  }

  speaker.say('summary', tally(verdicts));
}

/**
 * Runs the command; returns its exit code. A crash while measuring is reported with its reason and exits 2 (not
 * measured): left to escape it would exit 1, the code of a strict failure.
 * @es Ejecuta el comando; devuelve su código de salida. Un fallo al medir se informa con su motivo y sale con 2 (no
 * medido): si escapara saldría con 1, el código de un fallo estricto.
 */
export async function main(argv, speaker = makeSpeaker(MESSAGES), collect = collectFacts) {
  try {
    return await run(argv, speaker, collect);
  } catch (error) {
    const { en: reasonEn, es: reasonEs } = halvesOf(error?.message ?? error);

    speaker.complain('crashed', { reasonEn, reasonEs });

    return EXIT_NOT_MEASURED;
  }
}

/** The command's work, which may throw. @es El trabajo del comando, que puede lanzar. */
async function run(argv, speaker, collect) {
  const options = parseArguments(argv);

  if (options === undefined) {
    speaker.complain('usage');

    return EXIT_NOT_MEASURED;
  }

  const root = path.resolve(options.root);

  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    speaker.complain('notADirectory', { root });

    return EXIT_NOT_MEASURED;
  }

  const facts = await collect(root, { stack: options.stack });
  const verdicts = gradeProject(facts);
  const { enforced, total } = tally(verdicts);

  printReport(speaker, facts, verdicts);

  if (options.strict && enforced < total) {
    speaker.complain('strictFailed', { count: total - enforced });

    return EXIT_STRICT;
  }

  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
